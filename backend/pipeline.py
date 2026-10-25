"""Orchestrates CSV -> PySpark -> Cassandra -> PySpark -> dashboard payload.

``process_csv_file`` returns ``(payload, meta)`` identical in shape and content to what
``app.process_weather_dataframe`` produces, or ``None`` when the caller should use the
original pandas implementation (Spark/Java missing, unsupported file layout, ...).
It never raises: the existing application flow must not break because of the data layer.

Modes (chosen automatically from the environment):
  1. Spark + Cassandra : cleaned rows are stored in / served from Cassandra.
  2. Spark only        : Cassandra disabled or unreachable.
  3. Legacy pandas     : PySpark disabled/unavailable (returns None).
"""

import hashlib
import logging
import shutil
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import cassandra_store
import spark_pipeline as sp

logger = logging.getLogger("weather.pipeline")
if not logging.getLogger("weather").handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s [%(name)s] %(message)s"))
    logging.getLogger("weather").addHandler(_handler)
    logging.getLogger("weather").setLevel(logging.INFO)

# Bump when the cleaning rules change so previously stored datasets are rebuilt.
PIPELINE_VERSION = "1"

_run_lock = threading.Lock()   # one ingest at a time keeps Spark/Cassandra work predictable


def compute_dataset_id(csv_path: Path) -> str:
    """Stable id for a file's content: re-uploading identical data maps to the same rows."""
    digest = hashlib.sha256()
    digest.update(f"weather-pipeline-v{PIPELINE_VERSION}|".encode("utf-8"))
    with open(csv_path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()[:32]


def _build_meta(filename: str, raw: int, cleaned: int, dup: int, year_range, features) -> Dict[str, Any]:
    # Same keys and order as app.process_weather_dataframe.
    return {
        "dataset_name": filename,
        "is_custom": True,
        "total_raw_records": raw,
        "total_cleaned_records": cleaned,
        "duplicate_records": dup,
        "year_range": year_range,
        "features_detected": list(features),
        "uploaded_at": datetime.utcnow().isoformat(),
    }


def _from_cassandra(spark: Any, store: Any, record: Dict[str, Any], filename: str):
    rows = store.read_observations(record)
    df = sp.rows_to_dataframe(spark, rows)
    payload, year_range = sp.build_payload(spark, df, record["has_precip_column"])
    meta = _build_meta(filename, record["raw_records"], record["cleaned_records"],
                       record["duplicate_records"], year_range, record["features_detected"])
    return payload, meta


def process_csv_file(csv_path: Path, filename: str) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    """Runs the Spark/Cassandra pipeline. Returns None to request the legacy pandas path."""
    with _run_lock:
        try:
            spark = sp.get_spark()
            if spark is None:
                return None
            return _run(spark, Path(csv_path), filename)
        except sp.PipelineFallback as exc:
            logger.info("Using pandas path for '%s': %s", filename, exc)
            return None
        except Exception as exc:  # never break the app because of the data layer
            logger.warning("Spark pipeline failed for '%s' (%s: %s); using pandas path.",
                           filename, type(exc).__name__, exc)
            return None


def _run(spark: Any, csv_path: Path, filename: str):
    store = cassandra_store.get_store()
    dataset_id = compute_dataset_id(csv_path) if store is not None else None

    # 1) Already stored (e.g. after an app restart)? Serve it from Cassandra, insert nothing.
    if store is not None:
        try:
            record = store.get_complete_dataset(dataset_id)
            if record is not None:
                logger.info("Dataset %s already in Cassandra (%s rows); skipping insert.",
                            dataset_id, record["cleaned_records"])
                return _from_cassandra(spark, store, record, filename)
        except Exception as exc:
            logger.warning("Cassandra read failed (%s: %s); reprocessing with Spark.", type(exc).__name__, exc)
            cassandra_store.invalidate_store()
            store = None

    # 2) Load + clean with Spark. Spark reads a private copy so odd characters in the
    #    uploaded file name (spaces, brackets, ...) can never confuse its path handling.
    with tempfile.TemporaryDirectory(prefix="weather_ingest_") as tmp:
        spark_input = Path(tmp) / "input.csv"
        shutil.copyfile(csv_path, spark_input)
        clean = sp.clean_csv(spark, spark_input)
        try:
            # 3) Store in Cassandra (idempotent upsert) and read it back.
            if store is not None:
                try:
                    store.save_dataset(
                        dataset_id, filename, sp.dataframe_to_rows(clean.df),
                        clean.raw_count, clean.cleaned_count, clean.duplicate_count,
                        clean.has_precip_column, clean.features_detected,
                    )
                    record = store.get_complete_dataset(dataset_id)
                    if record is not None:
                        logger.info("Stored %s rows in Cassandra as dataset %s.", clean.cleaned_count, dataset_id)
                        return _from_cassandra(spark, store, record, filename)
                except Exception as exc:
                    logger.warning("Cassandra write/read failed (%s: %s); continuing without it.",
                                   type(exc).__name__, exc)
                    cassandra_store.invalidate_store()

            # 4) Spark-only result.
            payload, year_range = sp.build_payload(spark, clean.df, clean.has_precip_column)
            meta = _build_meta(filename, clean.raw_count, clean.cleaned_count, clean.duplicate_count,
                               year_range, clean.features_detected)
            return payload, meta
        finally:
            clean.release()
