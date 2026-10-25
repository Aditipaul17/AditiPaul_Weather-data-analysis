"""PySpark data pipeline for the weather dataset.

``clean_csv``      loads a CSV, removes duplicates, filters invalid rows and normalises
                   every field into the cleaned-observation schema stored in Cassandra.
``build_payload``  groups / aggregates a cleaned-observation DataFrame into the exact
                   columnar payload the dashboard already consumes.

The output is intentionally identical to ``process_weather_dataframe`` in ``app.py``.
Whenever Spark cannot guarantee identical output for a file (unusual date formats,
mixed UTC offsets, non-UTF-8 text, ...) ``PipelineFallback`` is raised and the caller
transparently uses the original pandas code instead.
"""

import logging
import os
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from config import get_settings

logger = logging.getLogger("weather.spark")

try:
    from pyspark.sql import SparkSession, DataFrame, Window
    from pyspark.sql import functions as F
    from pyspark.sql import types as T
    PYSPARK_AVAILABLE = True
except Exception:  # pragma: no cover - depends on the environment
    SparkSession = DataFrame = Window = F = T = None  # type: ignore
    PYSPARK_AVAILABLE = False

import numpy as np


class PipelineFallback(Exception):
    """The file needs the original pandas code path to behave exactly as before."""


# Mirrors the candidate lists in app.process_weather_dataframe (kept in sync by tests).
COLUMN_CANDIDATES = {
    "date": ["Formatted Date", "Date", "datetime", "timestamp", "Time", "Date/Time"],
    "summ": ["Summary", "Weather", "Condition", "Weather Condition", "Description", "Daily Summary"],
    "prec": ["Precip Type", "Precipitation Type", "Precipitation", "Precip", "rain_snow"],
    "temp": ["Temperature (C)", "Temperature", "Temp (C)", "Temp", "Temperature_C", "temperature"],
    "app": ["Apparent Temperature (C)", "Apparent Temperature", "Feels Like (C)", "Feels Like", "apparent_temperature"],
    "hum": ["Humidity", "humidity", "Relative Humidity"],
    "wind": ["Wind Speed (km/h)", "Wind Speed", "Wind", "Wind_Speed", "wind_speed"],
    "vis": ["Visibility (km)", "Visibility", "vis", "visibility"],
    "press": ["Pressure (millibars)", "Pressure", "pressure", "Pressure (hPa)", "Pressure_mb"],
}

# Strings pandas.read_csv turns into NaN by default.
NA_VALUES = [
    "", "#N/A", "#N/A N/A", "#NA", "-1.#IND", "-1.#QNAN", "-NaN", "-nan", "1.#IND", "1.#QNAN",
    "<NA>", "N/A", "NA", "NULL", "NaN", "None", "n/a", "nan", "null",
]

# yyyy-MM-dd or yyyy/MM/dd, optional  HH:mm[:ss[.fff]]  and optional UTC offset / Z.
_DATE_REGEX = (
    r"^\s*(\d{4})[-/](\d{2})[-/](\d{2})"
    r"(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?\s*$"
)

OBSERVATION_FIELDS = [
    "row_idx", "observed_at", "year", "month", "hour", "summary", "precip_type",
    "temperature", "apparent_temperature", "humidity", "wind_speed", "visibility", "pressure",
]

_NUMERIC_DEFAULTS = {  # same defaults as app.process_weather_dataframe
    "temperature": 0.0, "apparent_temperature": 0.0, "humidity": 0.5,
    "wind_speed": 10.0, "visibility": 10.0, "pressure": 1013.25,
}


@dataclass
class CleanResult:
    df: Any                     # cleaned observations (see OBSERVATION_FIELDS)
    raw_count: int
    cleaned_count: int
    duplicate_count: int
    has_precip_column: bool
    features_detected: List[str]
    cached: List[Any] = field(default_factory=list)

    def release(self) -> None:
        """Frees the DataFrames cached in Spark memory (call when the upload is done)."""
        for frame in self.cached:
            try:
                frame.unpersist()
            except Exception:
                pass
        self.cached = []


# ---------------------------------------------------------------------------
# Spark session
# ---------------------------------------------------------------------------
_spark_lock = threading.Lock()
_spark: Optional[Any] = None
_spark_failed = False


def get_spark() -> Optional[Any]:
    """Returns the shared SparkSession, or None when PySpark/Java are unavailable."""
    global _spark, _spark_failed
    settings = get_settings()
    if not settings.spark_enabled or not PYSPARK_AVAILABLE or _spark_failed:
        return None
    with _spark_lock:
        if _spark is not None:
            return _spark
        try:
            # Make Spark workers use the same interpreter as the API (important on Windows).
            os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
            os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)
            builder = (
                SparkSession.builder.appName("WeatherAnalytics")
                .master(settings.spark_master)
                .config("spark.ui.enabled", "false")
                .config("spark.ui.showConsoleProgress", "false")
                .config("spark.driver.memory", settings.spark_driver_memory)
                .config("spark.sql.shuffle.partitions", str(settings.spark_shuffle_partitions))
                .config("spark.sql.session.timeZone", "UTC")
                .config("spark.sql.legacy.timeParserPolicy", "CORRECTED")
                .config("spark.sql.execution.arrow.pyspark.enabled", "false")
            )
            if settings.spark_master.startswith("local"):
                builder = builder.config("spark.driver.bindAddress", "127.0.0.1").config("spark.driver.host", "127.0.0.1")
            session = builder.getOrCreate()
            session.sparkContext.setLogLevel("ERROR")
            _spark = session
            logger.info("SparkSession started (master=%s).", settings.spark_master)
            return _spark
        except Exception as exc:
            _spark_failed = True
            logger.warning("PySpark could not start (%s: %s); using the pandas fallback. "
                           "Is Java 8/11/17 installed and JAVA_HOME set?", type(exc).__name__, exc)
            return None


def stop_spark() -> None:
    global _spark
    with _spark_lock:
        if _spark is not None:
            try:
                _spark.stop()
            finally:
                _spark = None


# ---------------------------------------------------------------------------
# Cleaning
# ---------------------------------------------------------------------------
def _find_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    cols_lower = {c.strip().lower(): c for c in columns}
    for cand in candidates:
        hit = cols_lower.get(cand.strip().lower())
        if hit is not None:
            return hit
    return None


def _assert_utf8(csv_path: Path) -> None:
    """Spark silently replaces invalid bytes; pandas falls back to latin-1 instead."""
    try:
        with open(csv_path, "rb") as fh:
            decoder = __import__("codecs").getincrementaldecoder("utf-8")()
            while True:
                block = fh.read(1 << 20)
                if not block:
                    decoder.decode(b"", final=True)
                    break
                decoder.decode(block)
    except UnicodeDecodeError:
        raise PipelineFallback("File is not valid UTF-8")


def _num(col: Any, default: float) -> Any:
    """to_numeric(errors='coerce').fillna(default) in Spark."""
    c = col.cast("double")
    return F.coalesce(F.when(F.isnan(c), F.lit(None).cast("double")).otherwise(c), F.lit(float(default)))


def clean_csv(spark: Any, csv_path: Path) -> CleanResult:
    """Loads and cleans a weather CSV with Spark (mirrors app.process_weather_dataframe)."""
    csv_path = Path(csv_path)
    _assert_utf8(csv_path)

    raw = (
        spark.read.option("header", True)
        .option("inferSchema", False)
        .option("multiLine", True)
        .option("quote", '"')
        .option("escape", '"')
        .option("encoding", "UTF-8")
        .option("mode", "PERMISSIVE")
        .csv(csv_path.resolve().as_posix())
    )

    original_cols = [c.lstrip("\ufeff") for c in raw.columns]
    if len(set(original_cols)) != len(original_cols):
        raise PipelineFallback("Duplicate column names")
    internal = [f"c{i}" for i in range(len(original_cols))]
    to_internal = dict(zip(original_cols, internal))
    raw = raw.toDF(*internal)

    # Same missing-value markers pandas.read_csv uses.
    raw = raw.select(*[
        F.when(F.col(c).isin(NA_VALUES), F.lit(None).cast("string")).otherwise(F.col(c)).alias(c)
        for c in internal
    ])

    found = {k: _find_column(original_cols, v) for k, v in COLUMN_CANDIDATES.items()}
    if not found["date"] or not found["temp"]:
        raise PipelineFallback("Required date/temperature columns missing")

    raw = raw.withColumn("_rid", F.monotonically_increasing_id()).cache()
    raw_count = raw.count()
    if raw_count == 0:
        raw.unpersist()
        raise PipelineFallback("Empty file")

    # 1. Remove duplicate records (keep the first occurrence, like DataFrame.drop_duplicates).
    deduped = raw.groupBy(*internal).agg(F.min("_rid").alias("_rid"))

    # 2. Parse dates (wall-clock time, exactly what pandas .dt.* returns for a single UTC offset).
    d = F.col(to_internal[found["date"]])
    matches = d.rlike(_DATE_REGEX)

    def grp(i: int) -> Any:
        return F.regexp_extract(d, _DATE_REGEX, i)

    normalised = F.concat(
        grp(1), F.lit("-"), grp(2), F.lit("-"), grp(3), F.lit(" "),
        F.coalesce(F.when(grp(4) != "", grp(4)), F.lit("00")), F.lit(":"),
        F.coalesce(F.when(grp(5) != "", grp(5)), F.lit("00")),
    )
    summ_internal = to_internal[found["summ"]] if found["summ"] else None
    prec_internal = to_internal[found["prec"]] if found["prec"] else None
    category_cols = [c for c in (summ_internal, prec_internal) if c]

    parsed_cached = deduped.withColumn(
        "_ts", F.when(matches, F.to_timestamp(normalised, "yyyy-MM-dd HH:mm")),
    ).withColumn("_offset", F.when(matches, grp(7))).cache()
    parsed = parsed_cached

    # One aggregation job validates the whole file. Anything pandas would treat differently
    # (unparsed dates, mixed UTC offsets, all-numeric category columns) keeps using the
    # original code path so behaviour stays identical.
    aggs = [
        F.count(F.lit(1)).alias("deduped"),
        F.count(F.when(F.col("_ts").isNotNull(), 1)).alias("valid"),
        F.count(F.when(d.isNotNull() & F.col("_ts").isNull(), 1)).alias("unparsed"),
        F.countDistinct(F.when(F.col("_ts").isNotNull(), F.col("_offset"))).alias("offsets"),
    ]
    for c in category_cols:
        aggs.append(F.count(F.col(c)).alias(f"nn_{c}"))
        aggs.append(F.count(F.when(F.col(c).cast("double").isNotNull(), 1)).alias(f"num_{c}"))
    check = parsed.agg(*aggs).first()

    def bail(reason: str):
        for frame in (raw, parsed_cached):
            frame.unpersist()
        raise PipelineFallback(reason)

    if check["unparsed"] > 0:
        bail("Unsupported or invalid date format")
    if check["offsets"] > 1:
        bail("Mixed UTC offsets")
    for c in category_cols:
        # pandas would type a fully numeric text column as float and print values differently.
        if check[f"nn_{c}"] > 0 and check[f"nn_{c}"] == check[f"num_{c}"]:
            bail("Numeric category column")
    cleaned_count = check["valid"]
    if cleaned_count == 0:
        bail("No valid rows")

    # 3. Filter rows whose date is missing.
    parsed = parsed.where(F.col("_ts").isNotNull())

    # 4. Normalise all fields.
    if summ_internal:
        summary = F.regexp_replace(
            F.coalesce(F.col(summ_internal), F.lit("Clear / Unspecified")), r"(?U)^\s+|\s+$", ""
        )
    else:
        summary = F.lit("Clear")
    precip = F.col(prec_internal) if prec_internal else F.lit(None).cast("string")

    temp_col = F.col(to_internal[found["temp"]])
    numeric_exprs = {
        "temperature": _num(temp_col, _NUMERIC_DEFAULTS["temperature"]),
        "apparent_temperature": _num(F.col(to_internal[found["app"]]), 0.0) if found["app"]
        else _num(temp_col, _NUMERIC_DEFAULTS["temperature"]),
        "humidity": _num(F.col(to_internal[found["hum"]]), 0.5) if found["hum"] else F.lit(0.5),
        "wind_speed": _num(F.col(to_internal[found["wind"]]), 10.0) if found["wind"] else F.lit(10.0),
        "visibility": _num(F.col(to_internal[found["vis"]]), 10.0) if found["vis"] else F.lit(10.0),
        "pressure": _num(F.col(to_internal[found["press"]]), 1013.25) if found["press"] else F.lit(1013.25),
    }

    ordered = parsed.select(
        "_rid",
        F.date_format("_ts", "yyyy-MM-dd HH:mm").alias("observed_at"),
        F.year("_ts").alias("year"),
        F.month("_ts").alias("month"),
        F.hour("_ts").alias("hour"),
        summary.alias("summary"),
        precip.alias("precip_type"),
        *[expr.alias(name) for name, expr in numeric_exprs.items()],
    )
    # Contiguous 0..n-1 row index in original file order.
    window = Window.orderBy("_rid")
    cleaned = (
        ordered.withColumn("row_idx", (F.row_number().over(window) - 1).cast("int"))
        .select(*OBSERVATION_FIELDS)
        .cache()
    )

    features = [
        c for c in [found["date"], found["summ"], found["prec"], found["temp"], found["app"],
                    found["hum"], found["wind"], found["vis"], found["press"]]
        if c
    ]
    return CleanResult(
        df=cleaned,
        raw_count=raw_count,
        cleaned_count=cleaned_count,
        duplicate_count=raw_count - check["deduped"],
        has_precip_column=bool(found["prec"]),
        features_detected=features,
        cached=[raw, parsed_cached, cleaned],
    )


# ---------------------------------------------------------------------------
# Cassandra rows <-> DataFrame
# ---------------------------------------------------------------------------
def observations_schema() -> Any:
    return T.StructType([
        T.StructField("row_idx", T.IntegerType(), False),
        T.StructField("observed_at", T.StringType(), False),
        T.StructField("year", T.IntegerType(), False),
        T.StructField("month", T.IntegerType(), False),
        T.StructField("hour", T.IntegerType(), False),
        T.StructField("summary", T.StringType(), False),
        T.StructField("precip_type", T.StringType(), True),
        T.StructField("temperature", T.DoubleType(), False),
        T.StructField("apparent_temperature", T.DoubleType(), False),
        T.StructField("humidity", T.DoubleType(), False),
        T.StructField("wind_speed", T.DoubleType(), False),
        T.StructField("visibility", T.DoubleType(), False),
        T.StructField("pressure", T.DoubleType(), False),
    ])


def rows_to_dataframe(spark: Any, rows: List[Tuple]) -> Any:
    """Turns rows retrieved from Cassandra into a Spark DataFrame ('' precipitation -> NULL)."""
    df = spark.createDataFrame(rows, schema=observations_schema())
    return df.withColumn("precip_type", F.when(F.col("precip_type") != "", F.col("precip_type")))


def dataframe_to_rows(df: Any):
    """Streams cleaned observations to the Cassandra writer (NULL precipitation -> '')."""
    for r in df.orderBy("row_idx").toLocalIterator():
        yield (
            r["row_idx"], r["observed_at"], r["year"], r["month"], r["hour"], r["summary"],
            r["precip_type"] if r["precip_type"] is not None else "",
            r["temperature"], r["apparent_temperature"], r["humidity"],
            r["wind_speed"], r["visibility"], r["pressure"],
        )


# ---------------------------------------------------------------------------
# Grouping / aggregation -> dashboard payload
# ---------------------------------------------------------------------------
def _round4(values: List[float]) -> List[float]:
    # Same call pandas' Series.round(4) makes, so values match bit for bit.
    return np.round(np.asarray(values, dtype="float64"), 4).tolist()


def build_payload(spark: Any, df: Any, has_precip_column: bool) -> Tuple[Dict[str, Any], List[int]]:
    """Groups/aggregates cleaned observations into the dashboard's columnar payload."""
    groups = df.groupBy("summary", "precip_type").agg(
        F.min("year").alias("y_min"), F.max("year").alias("y_max")
    ).collect()
    summ = sorted({g["summary"] for g in groups}) or ["Clear"]
    if has_precip_column:
        prec = sorted({g["precip_type"] for g in groups if g["precip_type"] is not None})
    else:
        prec = ["rain", "snow"]
    year_range = [min(g["y_min"] for g in groups), max(g["y_max"] for g in groups)] if groups else []

    summ_map = spark.createDataFrame([(v, i) for i, v in enumerate(summ)], "summary string, s int")
    joined = df.join(F.broadcast(summ_map), on="summary", how="left")
    if prec:
        prec_map = spark.createDataFrame([(v, i) for i, v in enumerate(prec)], "precip_type string, p int")
        joined = joined.join(F.broadcast(prec_map), on="precip_type", how="left")
    else:
        joined = joined.withColumn("p", F.lit(None).cast("int"))
    joined = joined.withColumn("s", F.coalesce(F.col("s"), F.lit(0))).withColumn("p", F.coalesce(F.col("p"), F.lit(-1)))

    rows = joined.orderBy("row_idx").select(
        "observed_at", "year", "month", "hour", "s", "p", "temperature", "apparent_temperature",
        "humidity", "wind_speed", "visibility", "pressure",
    ).collect()

    cols = list(zip(*rows)) if rows else [[] for _ in range(12)]
    payload = {
        "summ": summ,
        "prec": prec,
        "d": list(cols[0]),
        "y": [int(x) for x in cols[1]],
        "m": [int(x) for x in cols[2]],
        "h": [int(x) for x in cols[3]],
        "s": [int(x) for x in cols[4]],
        "p": [int(x) for x in cols[5]],
        "T": _round4(cols[6]),
        "A": _round4(cols[7]),
        "H": _round4(cols[8]),
        "W": _round4(cols[9]),
        "V": _round4(cols[10]),
        "P": _round4(cols[11]),
    }
    return payload, year_range
