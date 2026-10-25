"""Integration tests for the PySpark + Cassandra data layer.

Cassandra is simulated by an in-memory fake session that follows the same
upsert-by-primary-key semantics as a real cluster, so these tests run anywhere
(no Cassandra server needed).  Spark needs Java 8/11/17/21.
"""

import csv
import random
import warnings
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

warnings.filterwarnings("ignore")

import app as backend_app  # noqa: E402
import cassandra_store  # noqa: E402
import pipeline  # noqa: E402
import spark_pipeline  # noqa: E402

SAMPLE = Path(backend_app.SAMPLE_CSV_PATH)


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def legacy(path: Path, name: str):
    """Result of the ORIGINAL pandas implementation."""
    payload, meta = backend_app.process_weather_dataframe(pd.read_csv(path), name)
    meta.pop("uploaded_at")
    return payload, meta


def via_pipeline(path: Path, name: str):
    result = pipeline.process_csv_file(path, name)
    assert result is not None, "pipeline unexpectedly fell back to pandas"
    payload, meta = result
    meta.pop("uploaded_at")
    return payload, meta


class FakeResult(list):
    def one(self):
        return self[0] if self else None


class FakeSession:
    """Minimal in-memory stand-in for a Cassandra session (upsert semantics)."""

    def __init__(self):
        self.datasets, self.obs = {}, {}
        self.obs_insert_calls = 0
        self.fail_reads = False

    def set_keyspace(self, _):
        pass

    def prepare(self, query):
        return SimpleNamespace(query_string=query)

    def execute(self, stmt, params=None):
        q = (stmt if isinstance(stmt, str) else stmt.query_string).strip()
        if q.startswith("CREATE"):
            return FakeResult()
        if q.startswith("INSERT INTO weather_observations"):
            self.obs[(params[0], params[1], params[2])] = params   # same key -> overwrite
            self.obs_insert_calls += 1
            return FakeResult()
        if q.startswith("INSERT INTO datasets"):
            self.datasets[params[0]] = params
            return FakeResult()
        if "FROM datasets" in q:
            p = self.datasets.get(params[0])
            if p is None:
                return FakeResult()
            keys = ["dataset_id", "dataset_name", "status", "raw_records", "cleaned_records",
                    "duplicate_records", "bucket_size", "has_precip_column", "features_detected"]
            return FakeResult([SimpleNamespace(**dict(zip(keys, p)))])
        if "FROM weather_observations" in q:
            if self.fail_reads:
                raise RuntimeError("simulated read timeout")
            rows = sorted((k, v) for k, v in self.obs.items() if k[0] == params[0] and k[1] == params[1])
            return FakeResult(
                SimpleNamespace(**dict(zip(cassandra_store.OBSERVATION_COLUMNS, v[2:]))) for _, v in rows
            )
        raise AssertionError(f"Unexpected CQL: {q}")


class FakeStore(cassandra_store.CassandraStore):
    def _bulk_execute(self, statement, parameters):
        for p in parameters:
            self.session.execute(statement, p)


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SPARK_ENABLED", "true")
    monkeypatch.setenv("CASSANDRA_ENABLED", "false")
    monkeypatch.setattr(cassandra_store, "invalidate_store", lambda: None)
    yield


@pytest.fixture(scope="session", autouse=True)
def _stop_spark():
    yield
    spark_pipeline.stop_spark()


def use_store(monkeypatch, session=None):
    session = session or FakeSession()
    store = FakeStore(session, "weather_analytics")
    monkeypatch.setattr(cassandra_store, "get_store", lambda: store)
    return session, store


def write_csv(path: Path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    return path


def messy_csv(path: Path, n=3000, seed=7):
    rng = random.Random(seed)
    header = ["Formatted Date", "Summary", "Precip Type", "Temperature (C)", "Apparent Temperature (C)",
              "Humidity", "Wind Speed (km/h)", "Visibility (km)", "Pressure (millibars)", "Daily Summary"]
    start = pd.Timestamp("2009-12-30 00:00")
    rows = []
    for i in range(n):
        ts = start + pd.Timedelta(hours=i)
        date = "" if rng.random() < 0.01 else ts.strftime("%Y-%m-%d %H:%M:%S.000 +0100")
        summ = rng.choice(["Clear", "  Partly Cloudy ", "Overcast", "", "NA", "Foggy and, Windy", 'Rain "heavy"'])
        prec = rng.choice(["rain", "snow", "", "null", "rain"])
        num = lambda lo, hi, miss=0.03: rng.choice(["", "NA", "abc"]) if rng.random() < miss else repr(rng.uniform(lo, hi))
        rows.append([date, summ, prec, num(-15, 35), num(-20, 38), num(0, 1), num(0, 60), num(0, 16),
                     num(990, 1040), f"{summ.strip()} throughout, the day."])
    for _ in range(60):                       # exact duplicates scattered through the file
        rows.insert(rng.randrange(len(rows)), list(rng.choice(rows)))
    return write_csv(path, header, rows)


# ----------------------------------------------------------------------------
# parity with the original pandas implementation
# ----------------------------------------------------------------------------
def test_sample_matches_legacy():
    assert via_pipeline(SAMPLE, "sample_weather.csv") == legacy(SAMPLE, "sample_weather.csv")


def test_messy_data_matches_legacy(tmp_path):
    p = messy_csv(tmp_path / "messy.csv")
    assert via_pipeline(p, "messy.csv") == legacy(p, "messy.csv")


def test_alternate_column_names_match_legacy(tmp_path):
    rows = [[f"2015-06-{d:02d}T{h:02d}:30:00Z", "sunny" if h % 2 else "cloudy", 20 + h / 3, 0.4 + h / 100]
            for d in range(1, 6) for h in range(24)]
    p = write_csv(tmp_path / "alt.csv", ["timestamp", "Weather", "Temp", "Relative Humidity"], rows)
    assert via_pipeline(p, "alt.csv") == legacy(p, "alt.csv")


def test_file_with_path_spaces(tmp_path):
    p = tmp_path / "my weather data.csv"
    p.write_bytes(SAMPLE.read_bytes())
    assert via_pipeline(p, "my weather data.csv") == legacy(p, "my weather data.csv")


# ----------------------------------------------------------------------------
# files that must keep using the original pandas path (identical behaviour)
# ----------------------------------------------------------------------------
@pytest.mark.parametrize("name,header,rows", [
    ("mixed_offsets", ["Formatted Date", "Temperature (C)"],
     [["2006-03-26 00:00:00.000 +0100", 5.0], ["2006-04-01 00:00:00.000 +0200", 9.0]]),
    ("odd_date_format", ["Date", "Temperature"], [["01 Apr 2006", 5.0], ["02 Apr 2006", 6.0]]),
    ("no_temperature", ["Date", "Humidity"], [["2006-04-01", 0.5]]),
    ("header_only", ["Date", "Temperature"], []),
    ("numeric_summary", ["Date", "Temperature", "Summary"], [["2006-04-01", 5.0, 1], ["2006-04-02", 6.0, 2]]),
])
def test_unsupported_files_fall_back(tmp_path, name, header, rows):
    p = write_csv(tmp_path / f"{name}.csv", header, rows)
    assert pipeline.process_csv_file(p, p.name) is None


def test_latin1_file_falls_back(tmp_path):
    p = tmp_path / "latin1.csv"
    p.write_bytes("Date,Temperature,Summary\n2006-04-01,5.0,Nuageux\xe9\n".encode("latin-1"))
    assert pipeline.process_csv_file(p, p.name) is None


def test_spark_disabled_returns_none(monkeypatch):
    monkeypatch.setenv("SPARK_ENABLED", "false")
    assert pipeline.process_csv_file(SAMPLE, "sample_weather.csv") is None


# ----------------------------------------------------------------------------
# Cassandra behaviour
# ----------------------------------------------------------------------------
def test_cassandra_roundtrip_matches_legacy(monkeypatch):
    session, _ = use_store(monkeypatch)
    assert via_pipeline(SAMPLE, "sample_weather.csv") == legacy(SAMPLE, "sample_weather.csv")
    assert len(session.obs) == 1500 and len(session.datasets) == 1
    assert list(session.datasets.values())[0][2] == "complete"


def test_no_duplicates_after_restart(monkeypatch):
    session, _ = use_store(monkeypatch)
    first = via_pipeline(SAMPLE, "sample_weather.csv")
    inserts_after_first = session.obs_insert_calls

    # Same upload again -> served from Cassandra, nothing inserted.
    again = via_pipeline(SAMPLE, "sample_weather.csv")
    assert again == first and session.obs_insert_calls == inserts_after_first

    # "Restart": brand-new store object on the same database.
    use_store(monkeypatch, session)
    after_restart = via_pipeline(SAMPLE, "sample_weather.csv")
    assert after_restart == first
    assert session.obs_insert_calls == inserts_after_first and len(session.obs) == 1500


def test_same_content_new_filename_reuses_rows(monkeypatch, tmp_path):
    session, _ = use_store(monkeypatch)
    via_pipeline(SAMPLE, "sample_weather.csv")
    copy = tmp_path / "renamed.csv"
    copy.write_bytes(SAMPLE.read_bytes())
    payload, meta = via_pipeline(copy, "renamed.csv")
    assert meta["dataset_name"] == "renamed.csv" and len(session.obs) == 1500


def test_interrupted_ingest_is_redone_without_duplicates(monkeypatch):
    session, _ = use_store(monkeypatch)
    via_pipeline(SAMPLE, "sample_weather.csv")
    session.datasets.clear()                        # crash before the 'complete' marker was written
    list(session.obs)[:1] and session.obs.pop(next(iter(session.obs)))   # and a row went missing
    assert via_pipeline(SAMPLE, "sample_weather.csv") == legacy(SAMPLE, "sample_weather.csv")
    assert len(session.obs) == 1500


def test_cassandra_unreachable_uses_spark_only(monkeypatch):
    monkeypatch.setattr(cassandra_store, "get_store", lambda: None)
    assert via_pipeline(SAMPLE, "sample_weather.csv") == legacy(SAMPLE, "sample_weather.csv")


def test_cassandra_error_mid_request_does_not_break(monkeypatch):
    session, _ = use_store(monkeypatch)
    session.fail_reads = True
    assert via_pipeline(SAMPLE, "sample_weather.csv") == legacy(SAMPLE, "sample_weather.csv")


def test_real_connect_failure_is_swallowed(monkeypatch):
    """No Cassandra server on this port: get_store() must return None, not raise."""
    if not cassandra_store.CASSANDRA_DRIVER_AVAILABLE:
        pytest.skip("cassandra-driver not installed")
    monkeypatch.setenv("CASSANDRA_ENABLED", "true")
    monkeypatch.setenv("CASSANDRA_HOSTS", "127.0.0.1")
    monkeypatch.setenv("CASSANDRA_PORT", "59042")
    monkeypatch.setenv("CASSANDRA_CONNECT_TIMEOUT", "2")
    monkeypatch.setattr(cassandra_store, "_store", None)
    monkeypatch.setattr(cassandra_store, "_last_failure", 0.0)
    assert cassandra_store.get_store() is None
    assert via_pipeline(SAMPLE, "sample_weather.csv") == legacy(SAMPLE, "sample_weather.csv")


# ----------------------------------------------------------------------------
# configuration
# ----------------------------------------------------------------------------
def test_cassandra_off_without_configuration(monkeypatch):
    from config import get_settings
    monkeypatch.delenv("CASSANDRA_ENABLED", raising=False)
    monkeypatch.delenv("CASSANDRA_HOSTS", raising=False)
    assert get_settings().cassandra_enabled is False
    monkeypatch.setenv("CASSANDRA_HOSTS", "db1, db2")
    s = get_settings()
    assert s.cassandra_enabled is True and s.cassandra_hosts == ["db1", "db2"]


# ----------------------------------------------------------------------------
# HTTP API: responses identical with and without the new data layer
# ----------------------------------------------------------------------------
def _strip(body):
    body = dict(body)
    body["meta"] = {k: v for k, v in body["meta"].items() if k != "uploaded_at"}
    body.pop("message", None) if False else None
    return body


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient
    return TestClient(backend_app.app)


def test_api_load_sample_identical(client, monkeypatch):
    use_store(monkeypatch)
    new = _strip(client.post("/api/load-sample").json())
    monkeypatch.setenv("SPARK_ENABLED", "false")
    old = _strip(client.post("/api/load-sample").json())
    assert new == old
    served = client.get("/api/weather").json()
    assert served["data"] == old["data"]


def test_api_upload_identical(client, monkeypatch):
    use_store(monkeypatch)
    with open(SAMPLE, "rb") as fh:
        new = _strip(client.post("/api/upload", files={"file": ("sample_weather.csv", fh, "text/csv")}).json())
    monkeypatch.setenv("SPARK_ENABLED", "false")
    with open(SAMPLE, "rb") as fh:
        old = _strip(client.post("/api/upload", files={"file": ("sample_weather.csv", fh, "text/csv")}).json())
    assert new == old


def test_api_error_behaviour_unchanged(client):
    r = client.post("/api/upload", files={"file": ("x.txt", b"a,b", "text/plain")})
    assert r.status_code == 400
    r = client.post("/api/upload", files={"file": ("empty.csv", b"", "text/csv")})
    assert r.status_code == 400 and "empty" in r.json()["detail"].lower()
    r = client.post("/api/upload", files={"file": ("hdr.csv", b"Date,Temperature\n", "text/csv")})
    assert r.status_code == 400 and "no rows" in r.json()["detail"].lower()
    r = client.post("/api/upload", files={"file": ("bad.csv", b"foo,bar\n1,2\n", "text/csv")})
    assert r.status_code == 500 and "date column" in r.json()["detail"]
