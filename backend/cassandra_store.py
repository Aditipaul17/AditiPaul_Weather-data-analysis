"""Apache Cassandra storage for cleaned weather observations.

Data model
----------
* ``datasets``              - one row per ingested dataset (metadata + status).
* ``weather_observations``  - one row per cleaned observation.

Duplicate protection
--------------------
``dataset_id`` is a hash of the file content (see ``pipeline.compute_dataset_id``)
and ``row_idx`` is the position of the row inside the cleaned dataset.  The
primary key is ``((dataset_id, bucket), row_idx)`` so re-inserting the same file
(for example after a restart) overwrites the same Cassandra cells - Cassandra
INSERTs are upserts - and can never create duplicates.  The dataset row is
written *last* with ``status = 'complete'``; an interrupted ingest is therefore
detected and simply redone.

Missing precipitation values are stored as an empty string instead of NULL so
that Cassandra does not create tombstones for them.
"""

import logging
import threading
import time
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

from config import Settings, get_settings

logger = logging.getLogger("weather.cassandra")

try:  # The driver is optional: the app must keep working without it.
    from cassandra.auth import PlainTextAuthProvider
    from cassandra.cluster import Cluster
    from cassandra.concurrent import execute_concurrent_with_args
    CASSANDRA_DRIVER_AVAILABLE = True
except Exception:  # pragma: no cover - depends on the environment
    Cluster = None  # type: ignore
    PlainTextAuthProvider = None  # type: ignore
    execute_concurrent_with_args = None  # type: ignore
    CASSANDRA_DRIVER_AVAILABLE = False

BUCKET_SIZE = 10_000          # rows per partition (keeps partitions small)
WRITE_CHUNK = 5_000           # rows handed to the driver per bulk call

OBSERVATION_COLUMNS = (
    "row_idx", "observed_at", "year", "month", "hour", "summary", "precip_type",
    "temperature", "apparent_temperature", "humidity", "wind_speed", "visibility", "pressure",
)


class CassandraIntegrityError(RuntimeError):
    """Raised when stored data does not match the dataset metadata."""


class CassandraStore:
    """Thin repository around a connected Cassandra session."""

    def __init__(self, session: Any, keyspace: str, replication_factor: int = 1, write_concurrency: int = 50):
        self.session = session
        self.keyspace = keyspace
        self.replication_factor = max(1, int(replication_factor))
        self.write_concurrency = write_concurrency
        self._ensure_schema()
        self._prepare()

    # ------------------------------------------------------------------ schema
    def _ensure_schema(self) -> None:
        self.session.execute(
            f"CREATE KEYSPACE IF NOT EXISTS {self.keyspace} "
            f"WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': {self.replication_factor}}}"
        )
        self.session.set_keyspace(self.keyspace)
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS datasets (
                dataset_id        text PRIMARY KEY,
                dataset_name      text,
                status            text,
                raw_records       int,
                cleaned_records   int,
                duplicate_records int,
                bucket_size       int,
                has_precip_column boolean,
                features_detected list<text>,
                created_at        timestamp
            )
            """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_observations (
                dataset_id           text,
                bucket               int,
                row_idx              int,
                observed_at          text,
                year                 int,
                month                int,
                hour                 int,
                summary              text,
                precip_type          text,
                temperature          double,
                apparent_temperature double,
                humidity             double,
                wind_speed           double,
                visibility           double,
                pressure             double,
                PRIMARY KEY ((dataset_id, bucket), row_idx)
            ) WITH CLUSTERING ORDER BY (row_idx ASC)
            """
        )

    def _prepare(self) -> None:
        self._insert_obs = self.session.prepare(
            "INSERT INTO weather_observations (dataset_id, bucket, row_idx, observed_at, year, month, hour, "
            "summary, precip_type, temperature, apparent_temperature, humidity, wind_speed, visibility, pressure) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        self._select_obs = self.session.prepare(
            "SELECT row_idx, observed_at, year, month, hour, summary, precip_type, temperature, "
            "apparent_temperature, humidity, wind_speed, visibility, pressure "
            "FROM weather_observations WHERE dataset_id = ? AND bucket = ?"
        )
        self._insert_dataset = self.session.prepare(
            "INSERT INTO datasets (dataset_id, dataset_name, status, raw_records, cleaned_records, "
            "duplicate_records, bucket_size, has_precip_column, features_detected, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        self._select_dataset = self.session.prepare(
            "SELECT dataset_id, dataset_name, status, raw_records, cleaned_records, duplicate_records, "
            "bucket_size, has_precip_column, features_detected FROM datasets WHERE dataset_id = ?"
        )

    # ------------------------------------------------------------------- reads
    def get_complete_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        """Returns the dataset record if it was fully ingested, otherwise None."""
        row = self.session.execute(self._select_dataset, (dataset_id,)).one()
        if row is None or row.status != "complete":
            return None
        return {
            "dataset_id": row.dataset_id,
            "dataset_name": row.dataset_name,
            "raw_records": row.raw_records,
            "cleaned_records": row.cleaned_records,
            "duplicate_records": row.duplicate_records,
            "bucket_size": row.bucket_size or BUCKET_SIZE,
            "has_precip_column": bool(row.has_precip_column),
            "features_detected": list(row.features_detected or []),
        }

    def read_observations(self, record: Dict[str, Any]) -> List[Tuple]:
        """Reads all observations of a dataset back in their original order."""
        bucket_size = record["bucket_size"]
        expected = record["cleaned_records"]
        n_buckets = (expected + bucket_size - 1) // bucket_size
        rows: List[Tuple] = []
        for bucket in range(n_buckets):
            result = self.session.execute(self._select_obs, (record["dataset_id"], bucket))
            rows.extend(tuple(getattr(r, c) for c in OBSERVATION_COLUMNS) for r in result)
        if len(rows) != expected:
            raise CassandraIntegrityError(
                f"Dataset {record['dataset_id']}: expected {expected} rows in Cassandra, found {len(rows)}."
            )
        return rows

    # ------------------------------------------------------------------ writes
    def _bulk_execute(self, statement: Any, parameters: List[Tuple]) -> None:
        execute_concurrent_with_args(
            self.session, statement, parameters,
            concurrency=self.write_concurrency, raise_on_first_error=True,
        )

    def save_dataset(
        self,
        dataset_id: str,
        dataset_name: str,
        observations: Iterable[Tuple],
        raw_records: int,
        cleaned_records: int,
        duplicate_records: int,
        has_precip_column: bool,
        features_detected: List[str],
    ) -> int:
        """Idempotently stores a cleaned dataset. Returns the number of rows written."""
        written = 0
        chunk: List[Tuple] = []
        for obs in observations:
            row_idx = obs[0]
            chunk.append((dataset_id, row_idx // BUCKET_SIZE) + tuple(obs))
            if len(chunk) >= WRITE_CHUNK:
                self._bulk_execute(self._insert_obs, chunk)
                written += len(chunk)
                chunk = []
        if chunk:
            self._bulk_execute(self._insert_obs, chunk)
            written += len(chunk)
        if written != cleaned_records:
            raise CassandraIntegrityError(
                f"Dataset {dataset_id}: tried to store {cleaned_records} rows but wrote {written}."
            )
        # Marking the dataset complete is the LAST write.
        self.session.execute(
            self._insert_dataset,
            (dataset_id, dataset_name, "complete", raw_records, cleaned_records, duplicate_records,
             BUCKET_SIZE, has_precip_column, list(features_detected), datetime.utcnow()),
        )
        return written


# ---------------------------------------------------------------------------
# Connection management (lazy, cached, never raises into the caller)
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_store: Optional[CassandraStore] = None
_cluster: Any = None
_last_failure: float = 0.0


def _connect(settings: Settings) -> CassandraStore:
    global _cluster
    auth = None
    if settings.cassandra_username and settings.cassandra_password:
        auth = PlainTextAuthProvider(settings.cassandra_username, settings.cassandra_password)
    cluster = Cluster(
        contact_points=settings.cassandra_hosts,
        port=settings.cassandra_port,
        auth_provider=auth,
        connect_timeout=settings.cassandra_connect_timeout,
    )
    try:
        session = cluster.connect()
        store = CassandraStore(
            session, settings.cassandra_keyspace,
            settings.cassandra_replication_factor, settings.cassandra_write_concurrency,
        )
    except Exception:
        cluster.shutdown()
        raise
    _cluster = cluster
    return store


def get_store() -> Optional[CassandraStore]:
    """Returns a ready CassandraStore, or None when Cassandra is disabled/unreachable.

    After a failed attempt we wait ``CASSANDRA_RETRY_SECONDS`` before trying again so
    an offline database never slows down every request, yet recovers automatically
    once it comes back.
    """
    global _store, _last_failure
    settings = get_settings()
    if not settings.cassandra_enabled:
        return None
    if not CASSANDRA_DRIVER_AVAILABLE:
        logger.warning("CASSANDRA_ENABLED is set but 'cassandra-driver' is not installed; using fallback.")
        return None
    with _lock:
        if _store is not None:
            return _store
        if _last_failure and (time.time() - _last_failure) < settings.cassandra_retry_seconds:
            return None
        try:
            _store = _connect(settings)
            logger.info("Connected to Cassandra %s:%s (keyspace '%s').",
                        ",".join(settings.cassandra_hosts), settings.cassandra_port, settings.cassandra_keyspace)
            return _store
        except Exception as exc:
            _last_failure = time.time()
            logger.warning("Cassandra unavailable (%s: %s); continuing without it.", type(exc).__name__, exc)
            return None


def invalidate_store() -> None:
    """Drops the cached connection (called after a runtime Cassandra error)."""
    global _store, _cluster, _last_failure
    with _lock:
        _store = None
        _last_failure = time.time()
        if _cluster is not None:
            try:
                _cluster.shutdown()
            except Exception:
                pass
            _cluster = None
