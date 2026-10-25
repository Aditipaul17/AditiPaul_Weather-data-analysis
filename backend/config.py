"""Runtime configuration for the optional Cassandra + PySpark data layer.

Everything is read from environment variables (optionally pre-loaded from
``backend/.env``).  Nothing here is required: when a setting is missing the
backend simply keeps using the original pandas code path.
"""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

_ENV_FILE = Path(__file__).resolve().parent / ".env"


def _load_env_file() -> None:
    """Loads KEY=VALUE pairs from backend/.env without overriding real env vars."""
    if not _ENV_FILE.exists():
        return
    try:
        for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except OSError:
        pass


_load_env_file()


def _flag(name: str) -> Optional[bool]:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # --- PySpark ---
    spark_enabled: bool
    spark_master: str
    spark_driver_memory: str
    spark_shuffle_partitions: int
    # --- Cassandra ---
    cassandra_enabled: bool
    cassandra_hosts: List[str]
    cassandra_port: int
    cassandra_keyspace: str
    cassandra_username: Optional[str]
    cassandra_password: Optional[str]
    cassandra_replication_factor: int
    cassandra_connect_timeout: int
    cassandra_retry_seconds: int
    cassandra_write_concurrency: int


def get_settings() -> Settings:
    """Reads settings from the environment (evaluated on every call)."""
    hosts_raw = os.environ.get("CASSANDRA_HOSTS", "").strip()
    explicit = _flag("CASSANDRA_ENABLED")
    # Auto mode: Cassandra is used only when hosts are configured.
    cassandra_enabled = explicit if explicit is not None else bool(hosts_raw)
    hosts = [h.strip() for h in (hosts_raw or "127.0.0.1").split(",") if h.strip()]

    spark_flag = _flag("SPARK_ENABLED")
    return Settings(
        spark_enabled=True if spark_flag is None else spark_flag,
        spark_master=os.environ.get("SPARK_MASTER", "local[*]").strip() or "local[*]",
        spark_driver_memory=os.environ.get("SPARK_DRIVER_MEMORY", "2g").strip() or "2g",
        spark_shuffle_partitions=_int("SPARK_SHUFFLE_PARTITIONS", 8),
        cassandra_enabled=cassandra_enabled,
        cassandra_hosts=hosts,
        cassandra_port=_int("CASSANDRA_PORT", 9042),
        cassandra_keyspace=os.environ.get("CASSANDRA_KEYSPACE", "weather_analytics").strip() or "weather_analytics",
        cassandra_username=os.environ.get("CASSANDRA_USERNAME") or None,
        cassandra_password=os.environ.get("CASSANDRA_PASSWORD") or None,
        cassandra_replication_factor=_int("CASSANDRA_REPLICATION_FACTOR", 1),
        cassandra_connect_timeout=_int("CASSANDRA_CONNECT_TIMEOUT", 5),
        cassandra_retry_seconds=_int("CASSANDRA_RETRY_SECONDS", 30),
        cassandra_write_concurrency=_int("CASSANDRA_WRITE_CONCURRENCY", 50),
    )
