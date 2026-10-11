# Weather Analytics Platform (Decoupled Full-Stack)

A production-grade, decoupled weather analytics platform built with **React**, **Vite**, **Tailwind CSS**, and a high-performance **FastAPI (Python)** backend.
https://aditipaul17.github.io/AditiPaul_Weather-data-analysis/
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
│   ├── requirements.txt          # Python dependencies (FastAPI, Pandas, etc.)
│   ├── sample_weather.csv        # Preloaded sample dataset
│   ├── weather.json              # Default preprocessed analytics JSON
│   └── uploads/                  # Storage directory for uploaded user CSVs
│
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
