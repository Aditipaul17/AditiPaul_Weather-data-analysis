# Weather Analytics Platform (Decoupled Full-Stack)

A production-grade, decoupled weather analytics platform built with **React**, **Vite**, **Tailwind CSS**, a high-performance **FastAPI (Python)** backend, **Apache Cassandra** NoSQL storage, and **Apache PySpark** distributed data processing.

[![Live Demo](https://img.shields.io/badge/Demo-Live%20Preview-brightgreen)](https://aditipaul17.github.io/AditiPaul_Weather-data-analysis/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](http://127.0.0.1:8000/docs)
[![PySpark](https://img.shields.io/badge/Engine-PySpark-E25A1C?logo=apachespark)](https://spark.apache.org/)
[![Cassandra](https://img.shields.io/badge/Database-Apache%20Cassandra-1287B1?logo=apachecassandra)](https://cassandra.apache.org/)

**Live Demo:** [https://aditipaul17.github.io/AditiPaul_Weather-data-analysis/](https://aditipaul17.github.io/AditiPaul_Weather-data-analysis/)

---

## 🚀 Application Flow

The application follows a clean 3-step workflow:

```
┌─────────────────────────────────┐
│        1. LOGIN SCREEN          │  👉 Sign in with username & password or 1-click demo accounts
└────────────────┬────────────────┘
                 │ (Authenticated)
                 ▼
┌─────────────────────────────────┐
│     2. UPLOAD WEATHER CSV       │  👉 Dedicated CSV onboarding: drag & drop any weather CSV
└────────────────┬────────────────┘     or 1-click "Use Sample Dataset (96k records)"
                 │ (Dataset loaded & cleaned)
                 ▼
┌─────────────────────────────────┐
│ 3. WEATHER ANALYTICS DASHBOARD  │  👉 Full 10-page interactive analytics frontend:
└─────────────────────────────────┘     KPIs, Time Trends, Correlation Heatmap, Extremes, etc.
```

---

## 📂 Separated Architecture (Frontend & Backend)

The project is cleanly decoupled into two standalone modules:

```
wa/
├── frontend/                     # Standalone React + Vite Client
│   ├── package.json              # Frontend dependencies & scripts
│   ├── vite.config.js            # Vite configuration with /api backend proxy
│   ├── index.html                # Single-page HTML entry point
│   ├── tailwind.config.js        # Tailwind CSS theme configuration
│   ├── public/                   # Static assets & sample datasets
│   └── src/
│       ├── components/
│       │   ├── Login.jsx         # Step 1: Authentication UI (Login & Sign Up)
│       │   └── UploadScreen.jsx  # Step 2: Dedicated Weather CSV Upload Screen
│       ├── App.jsx               # Orchestrates Login ➔ Upload ➔ Analytics
│       ├── lib.js                # Auth client, REST API helpers & compute engine
│       ├── pages.jsx             # Step 3: 10 Analytical Dashboard Modules
│       ├── ui.jsx                # Charts, KPI cards, tables & UI components
│       └── UploadModal.jsx       # In-dashboard quick dataset re-upload modal
│
├── backend/                      # Standalone Python / FastAPI REST API
│   ├── app.py                    # Complete FastAPI API (Auth, Upload, Clean, Serve)
│   ├── run.py                    # Uvicorn launcher
│   ├── requirements.txt          # Python dependencies (FastAPI, Pandas, PySpark, Cassandra driver)
│   ├── config.py                 # Env-based settings for Cassandra / PySpark (all optional)
│   ├── pipeline.py               # CSV ➔ PySpark ➔ Cassandra ➔ PySpark orchestration + fallbacks
│   ├── spark_pipeline.py         # PySpark loading, cleaning, grouping & aggregation
│   ├── cassandra_store.py        # Cassandra schema, idempotent writes and reads
│   ├── .env.example              # Example environment configuration
│   ├── tests/                    # Parity + Cassandra behaviour tests (pytest)
│   ├── sample_weather.csv        # Preloaded sample dataset
│   ├── weather.json              # Default preprocessed analytics JSON
│   └── uploads/                  # Storage directory for uploaded user CSVs
│
├── docker-compose.yml            # Local Apache Cassandra (optional)
└── package.json                  # Root runner script for seamless dev experience
```

---

## ⚡ Quick Start Guide

### 1. Start the Backend (FastAPI)

In your terminal:
```bash
# Install Python dependencies
pip install -r backend/requirements.txt

# Start backend server (runs on port 8000)
npm run backend
# Or:
cd backend && python run.py
```
- Optional: Apache Cassandra + PySpark can be enabled behind the API — see [Cassandra + PySpark Integration](#️-apache-cassandra--pyspark-integration-backend-only).
- **Backend API URL:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. Start the Frontend (React + Vite)

In a second terminal:
```bash
# Start frontend dev server (runs on port 5173)
npm run dev
# Or from the frontend directory:
cd frontend && npm run dev
```
- Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔑 Demo Credentials

You can use the built-in demo accounts (or click the **1-Click Demo** buttons on the Login screen):

| Username | Password | Role | Name |
|---|---|---|---|
| `admin` | `admin123` | Lead Data Scientist | Admin Analyst |
| `demo` | `demo123` | Meteorologist | Demo Researcher |

You can also switch to **Create Account** to register a new user.

---

## 📊 CSV Upload & Ingestion

Once logged in, the app asks you to upload your weather dataset:
1. **Drag and Drop** any weather CSV into the upload dropzone, or click **Browse Files**.
2. **One-Click Sample:** Click **Use Sample Dataset (weatherHistory.csv • 96k records)** to explore immediately without needing a local file.
3. **Template:** Click **Download Sample CSV** to view the recommended format.

### Expected Columns
The automated backend pipeline cleans and maps column variations automatically:
- **Date:** `Formatted Date`, `Date`, `timestamp`, `Date/Time`
- **Temperature:** `Temperature (C)`, `Temperature`, `Temp`
- **Humidity:** `Humidity`, `Relative Humidity`
- **Wind Speed:** `Wind Speed (km/h)`, `Wind Speed`
- **Summary:** `Summary`, `Weather`, `Condition`
- **Precipitation:** `Precip Type`, `Precipitation`
- **Visibility & Pressure:** `Visibility (km)`, `Pressure (millibars)`

---

## 🗄️ Apache Cassandra + PySpark Integration (backend only)

Cassandra and PySpark run **behind the existing API**. The React UI, every endpoint, and every
response are unchanged — the dashboard looks and behaves exactly as before.

```
CSV upload / sample ─► PySpark: load, de-duplicate, filter, clean ─► Cassandra (store)
                                                                        │
Dashboard payload ◄─ PySpark: group + aggregate ◄──────────────────── Cassandra (retrieve)
```

| Mode | When | What happens |
|---|---|---|
| **Spark + Cassandra** | `CASSANDRA_HOSTS` set and reachable | Cleaned rows are stored in Cassandra and the dashboard payload is built from the rows read back |
| **Spark only** | Cassandra not configured / unreachable | Same PySpark processing, no database |
| **Original pandas** | PySpark disabled, Java missing, or an unusual file layout | The original code path runs untouched |

The backend never fails because of this layer: every error silently falls back to the next mode
(a warning is logged in the backend console).

### Prerequisites
- Python 3.9 – 3.12 and **Java 8, 11, 17 or 21** (PySpark needs a JVM; check with `java -version`)
- Docker (only to run Cassandra locally) — or any reachable Cassandra 4.x / 5.x cluster

### 1. Start Cassandra
```bash
docker compose up -d cassandra
docker compose ps          # wait until the container is "healthy" (first start takes ~1 minute)
```

### 2. Install and configure the backend
```bash
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env      # then edit if needed
```
Settings are read from `backend/.env` or real environment variables (real variables win).
Everything is optional — with nothing set the app runs exactly like before.

**Cassandra**

| Variable | Default | Purpose |
|---|---|---|
| `CASSANDRA_HOSTS` | *(unset = Cassandra off)* | Comma-separated contact points, e.g. `127.0.0.1` |
| `CASSANDRA_ENABLED` | auto | `true` / `false` to force on or off |
| `CASSANDRA_PORT` | `9042` | Native transport port |
| `CASSANDRA_KEYSPACE` | `weather_analytics` | Created automatically if missing |
| `CASSANDRA_USERNAME` / `CASSANDRA_PASSWORD` | – | Optional authentication |
| `CASSANDRA_REPLICATION_FACTOR` | `1` | `SimpleStrategy` factor used when creating the keyspace (use a production strategy for real clusters) |
| `CASSANDRA_CONNECT_TIMEOUT` | `5` | Seconds before giving up on a connection |
| `CASSANDRA_RETRY_SECONDS` | `30` | After a failed connection, wait this long before retrying |

**PySpark**

| Variable | Default | Purpose |
|---|---|---|
| `SPARK_ENABLED` | `true` | Set `false` to always use the original pandas code |
| `SPARK_MASTER` | `local[*]` | Spark master URL |
| `SPARK_DRIVER_MEMORY` | `2g` | Driver memory |
| `SPARK_SHUFFLE_PARTITIONS` | `8` | Shuffle partitions (Spark's default of 200 is wasteful for local runs) |

Setting variables without a `.env` file:
```bash
# macOS / Linux
export CASSANDRA_HOSTS=127.0.0.1
# Windows PowerShell
$env:CASSANDRA_HOSTS = "127.0.0.1"
```

### 3. Run (same commands as before)
```bash
npm run backend        # or: cd backend && python run.py
npm run dev            # in a second terminal
```
Log in, then upload a CSV or click **Use Sample Dataset**. The first upload after the server
starts takes a few extra seconds while Spark starts its JVM.

### 4. Verify the data is in Cassandra
```bash
docker exec -it weather-cassandra cqlsh -e "SELECT dataset_name, status, cleaned_records FROM weather_analytics.datasets;"
docker exec -it weather-cassandra cqlsh -e "SELECT count(*) FROM weather_analytics.weather_observations;"
```
The backend console prints lines such as `Stored 1500 rows in Cassandra as dataset …`.

### No duplicate data on restart
- Each file is identified by a hash of its **content** (`dataset_id`), and each cleaned row by its
  position (`row_idx`). The table primary key is `((dataset_id, bucket), row_idx)`, so writing the
  same rows again overwrites them instead of adding new ones (Cassandra inserts are upserts).
- A dataset is marked `complete` only after all of its rows are written. On the next upload of the
  same file the backend finds the completed dataset and **inserts nothing**; an interrupted ingest is
  simply redone.
- Restarting the backend does not change which screen you see: the dashboard still starts at the
  login / upload flow, and `POST /api/reset` still only clears the in-memory dataset
  (it does not delete anything from Cassandra).

To wipe stored data: `docker exec -it weather-cassandra cqlsh -e "DROP KEYSPACE weather_analytics;"`

### Notes
- Files the pandas code could not handle (e.g. mixed UTC offsets, non-UTF-8 text) and unusual
  date formats keep using the original pandas path, so results and errors are identical to before.
- At this dataset size pandas is faster than Spark; the integration is about exercising the
  Spark/Cassandra stack, not about speed.
- Docker image: `backend/Dockerfile` now installs a Java runtime so PySpark works in the container.
  Point `CASSANDRA_HOSTS` at your Cassandra host (e.g. `host.docker.internal`).

### Tests
```bash
cd backend && pip install pytest httpx && python -m pytest tests -q
```
The tests compare the Spark/Cassandra output with the original pandas implementation (sample data, messy data, alternate column names) and simulate Cassandra with an in-memory fake (no server needed) to check
restart / no-duplicate / failure behaviour, and check the HTTP responses are identical.

---

## 🌐 REST API Endpoints

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate user & return session token |
| `POST` | `/api/auth/register` | Register a new account |
| `GET` | `/api/auth/me` | Get profile for currently authenticated user |
| `POST` | `/api/auth/logout` | Revoke active session |
| `GET` | `/api/auth/demo-credentials` | Fetch demo accounts for 1-click login |

### Dataset & Analytics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & dataset summary |
| `GET` | `/api/dataset/status` | Check if a dataset is actively loaded |
| `GET` | `/api/weather` | Retrieve cleaned analytical weather payload |
| `POST` | `/api/upload` | Upload & clean CSV (deduplicates & normalizes) |
| `POST` | `/api/load-sample` | 1-click load preconfigured sample dataset |
| `POST` | `/api/reset` | Clear active dataset |
| `GET` | `/api/sample-csv` | Download sample test CSV |

---

## 🛠️ Offline & Client Fallback

The frontend is designed with dual-engine resilience:
- When connected to the FastAPI backend, processing is accelerated by Python/Pandas on port 8000.
- If running client-only (e.g. static preview or offline deployment), the in-browser CSV parser and local authentication engine activate automatically.
