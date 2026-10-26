"""FastAPI Backend for Weather Analytics Platform.
Provides Authentication, CSV Dataset Processing, and Weather Analytics APIs.
"""

import os
import io
import json
import secrets
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np

import pipeline  # optional PySpark + Cassandra data layer (falls back to pandas below)

# Base paths
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
USERS_FILE = BASE_DIR / "users.json"
DEFAULT_JSON_PATH = BASE_DIR / "weather.json"
if not DEFAULT_JSON_PATH.exists():
    DEFAULT_JSON_PATH = ROOT_DIR / "public" / "weather.json"

SAMPLE_CSV_PATH = BASE_DIR / "sample_weather.csv"
if not SAMPLE_CSV_PATH.exists():
    SAMPLE_CSV_PATH = ROOT_DIR / "public" / "sample_weather.csv"

app = FastAPI(
    title="Weather Analytics Backend API",
    description="Decoupled backend powering authentication, CSV ingestion, cleaning, and analytics.",
    version="2.0.0"
)

# Enable CORS for local dev servers (Vite on port 5173, preview, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# 1. AUTHENTICATION & USER MANAGEMENT
# ==============================================================================

def hash_password(password: str, salt: str = "wa_salt_2026") -> str:
    """Produces SHA-256 hash of password with salt."""
    return hashlib.sha256(f"{salt}_{password}".encode("utf-8")).hexdigest()

DEFAULT_USERS = {
    "admin": {
        "username": "admin",
        "name": "Admin Analyst",
        "email": "admin@weatheranalytics.io",
        "role": "Lead Data Scientist",
        "password_hash": hash_password("admin123"),
        "created_at": "2026-01-01T00:00:00"
    },
    "demo": {
        "username": "demo",
        "name": "Demo Researcher",
        "email": "demo@weatheranalytics.io",
        "role": "Meteorologist",
        "password_hash": hash_password("demo123"),
        "created_at": "2026-01-01T00:00:00"
    }
}

def load_users() -> Dict[str, Dict[str, Any]]:
    """Loads users from disk or initializes defaults."""
    if USERS_FILE.exists():
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Ensure default users exist
                for k, v in DEFAULT_USERS.items():
                    if k not in data:
                        data[k] = v
                return data
        except Exception:
            pass
    save_users(DEFAULT_USERS)
    return DEFAULT_USERS.copy()

def save_users(users: Dict[str, Dict[str, Any]]):
    """Saves users to JSON file."""
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)

USERS = load_users()
# Active session tokens: token -> {"username": username, "created_at": datetime}
ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    name: str
    email: Optional[str] = None


def get_current_user(authorization: Optional[str] = Header(None), x_auth_token: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """Extracts authenticated user from Authorization or X-Auth-Token header."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    elif x_auth_token:
        token = x_auth_token
    
    if token and token in ACTIVE_SESSIONS:
        username = ACTIVE_SESSIONS[token]["username"]
        if username in USERS:
            user_info = USERS[username].copy()
            user_info.pop("password_hash", None)
            return user_info
    return None


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """Validates user credentials and issues session token."""
    username = req.username.strip().lower()
    if username not in USERS:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    user = USERS[username]
    if user["password_hash"] != hash_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    token = secrets.token_hex(24)
    ACTIVE_SESSIONS[token] = {
        "username": username,
        "created_at": datetime.utcnow().isoformat()
    }
    
    user_info = user.copy()
    user_info.pop("password_hash", None)
    
    return {
        "success": True,
        "token": token,
        "user": user_info,
        "message": f"Welcome back, {user['name']}!"
    }


@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    """Registers a new user account."""
    username = req.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")
    if username in USERS:
        raise HTTPException(status_code=400, detail="Username is already taken. Please choose another.")
    
    new_user = {
        "username": username,
        "name": req.name.strip() or username.capitalize(),
        "email": req.email.strip() if req.email else f"{username}@weatheranalytics.io",
        "role": "Weather Analyst",
        "password_hash": hash_password(req.password),
        "created_at": datetime.utcnow().isoformat()
    }
    USERS[username] = new_user
    save_users(USERS)
    
    token = secrets.token_hex(24)
    ACTIVE_SESSIONS[token] = {
        "username": username,
        "created_at": datetime.utcnow().isoformat()
    }
    
    user_info = new_user.copy()
    user_info.pop("password_hash", None)
    
    return {
        "success": True,
        "token": token,
        "user": user_info,
        "message": f"Account created successfully for {new_user['name']}!"
    }


@app.get("/api/auth/me")
async def get_me(user: Optional[Dict[str, Any]] = Depends(get_current_user)):
    """Returns currently authenticated user profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return {"authenticated": True, "user": user}


@app.post("/api/auth/logout")
async def logout(authorization: Optional[str] = Header(None), x_auth_token: Optional[str] = Header(None)):
    """Logs out and revokes active token."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    elif x_auth_token:
        token = x_auth_token
    
    if token and token in ACTIVE_SESSIONS:
        del ACTIVE_SESSIONS[token]
    return {"success": True, "message": "Logged out successfully."}


@app.get("/api/auth/demo-credentials")
async def get_demo_credentials():
    """Provides demo credentials for quick testing in frontend."""
    return {
        "accounts": [
            {"username": "admin", "password": "admin123", "role": "Lead Data Scientist", "name": "Admin Analyst"},
            {"username": "demo", "password": "demo123", "role": "Meteorologist", "name": "Demo Researcher"},
        ]
    }


# ==============================================================================
# 2. DATASET STORAGE & CLEANING LOGIC
# ==============================================================================

# In-memory storage for active dataset and metadata
ACTIVE_DATA: Optional[Dict[str, Any]] = None
ACTIVE_META: Optional[Dict[str, Any]] = None

def load_default_data() -> Optional[Dict[str, Any]]:
    """Loads default precomputed dataset from weather.json if available."""
    if DEFAULT_JSON_PATH.exists():
        with open(DEFAULT_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

def find_column(df_columns, candidates):
    """Finds matching column name case-insensitively from a list of candidates."""
    cols_lower = {c.strip().lower(): c for c in df_columns}
    for cand in candidates:
        cand_lower = cand.strip().lower()
        if cand_lower in cols_lower:
            return cols_lower[cand_lower]
    return None

def process_weather_dataframe(df: pd.DataFrame, filename: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Cleans, normalizes, and encodes a weather dataframe into the columnar dashboard schema."""
    raw_count = len(df)
    
    # 1. Remove duplicate records
    df = df.drop_duplicates()
    cleaned_count = len(df)
    dup_count = raw_count - cleaned_count

    cols = df.columns.tolist()

    # 2. Identify required columns with smart fallbacks
    date_col = find_column(cols, [
        "Formatted Date", "Date", "datetime", "timestamp", "Time", "Date/Time"
    ])
    summ_col = find_column(cols, [
        "Summary", "Weather", "Condition", "Weather Condition", "Description", "Daily Summary"
    ])
    prec_col = find_column(cols, [
        "Precip Type", "Precipitation Type", "Precipitation", "Precip", "rain_snow"
    ])
    temp_col = find_column(cols, [
        "Temperature (C)", "Temperature", "Temp (C)", "Temp", "Temperature_C", "temperature"
    ])
    app_temp_col = find_column(cols, [
        "Apparent Temperature (C)", "Apparent Temperature", "Feels Like (C)", "Feels Like", "apparent_temperature"
    ])
    hum_col = find_column(cols, [
        "Humidity", "humidity", "Relative Humidity"
    ])
    wind_col = find_column(cols, [
        "Wind Speed (km/h)", "Wind Speed", "Wind", "Wind_Speed", "wind_speed"
    ])
    vis_col = find_column(cols, [
        "Visibility (km)", "Visibility", "vis", "visibility"
    ])
    press_col = find_column(cols, [
        "Pressure (millibars)", "Pressure", "pressure", "Pressure (hPa)", "Pressure_mb"
    ])

    if not date_col or not temp_col:
        raise ValueError(
            "Uploaded CSV must contain at least a date column ('Formatted Date' or 'Date') "
            "and a temperature column ('Temperature (C)' or 'Temperature')."
        )

    # 3. Parse and standardize dates
    try:
        parsed_dates = pd.to_datetime(df[date_col], errors="coerce")
    except Exception:
        parsed_dates = pd.to_datetime(df[date_col].astype(str), errors="coerce")

    # Drop rows where date is completely unparseable
    valid_mask = parsed_dates.notna()
    if not valid_mask.all():
        df = df[valid_mask].copy()
        parsed_dates = parsed_dates[valid_mask]

    date_str_series = parsed_dates.dt.strftime("%Y-%m-%d %H:%M")
    years = parsed_dates.dt.year.astype(int).tolist()
    months = parsed_dates.dt.month.astype(int).tolist()
    hours = parsed_dates.dt.hour.astype(int).tolist()

    # 4. Process Summaries
    if summ_col and summ_col in df:
        df[summ_col] = df[summ_col].fillna("Clear / Unspecified").astype(str).str.strip()
    else:
        df["_gen_summ"] = "Clear"
        summ_col = "_gen_summ"

    summ = sorted([str(x) for x in df[summ_col].unique() if str(x) != "nan"])
    if not summ:
        summ = ["Clear"]
    summ_map = {k: i for i, k in enumerate(summ)}
    s_indices = df[summ_col].map(summ_map).fillna(0).astype(int).tolist()

    # 5. Process Precipitation Types
    if prec_col and prec_col in df:
        clean_prec = df[prec_col].replace({np.nan: None, "null": None, "": None})
        prec_unique = sorted([str(x) for x in clean_prec.dropna().unique()])
        prec_map = {k: i for i, k in enumerate(prec_unique)}
        p_indices = clean_prec.map(prec_map).fillna(-1).astype(int).tolist()
        prec = prec_unique
    else:
        prec = ["rain", "snow"]
        p_indices = [-1] * len(df)

    # 6. Process Numerical Features
    def clean_num(series, default_val=0.0):
        if series is None:
            return [default_val] * len(df)
        nums = pd.to_numeric(series, errors="coerce").fillna(default_val)
        return nums.round(4).tolist()

    T = clean_num(df[temp_col])
    A = clean_num(df[app_temp_col] if app_temp_col else df[temp_col])
    H = clean_num(df[hum_col] if hum_col else None, default_val=0.5)
    W = clean_num(df[wind_col] if wind_col else None, default_val=10.0)
    V = clean_num(df[vis_col] if vis_col else None, default_val=10.0)
    P = clean_num(df[press_col] if press_col else None, default_val=1013.25)

    payload = {
        "summ": summ,
        "prec": prec,
        "d": date_str_series.tolist(),
        "y": years,
        "m": months,
        "h": hours,
        "s": s_indices,
        "p": p_indices,
        "T": T,
        "A": A,
        "H": H,
        "W": W,
        "V": V,
        "P": P,
    }

    meta = {
        "dataset_name": filename,
        "is_custom": True,
        "total_raw_records": raw_count,
        "total_cleaned_records": len(years),
        "duplicate_records": dup_count,
        "year_range": [min(years), max(years)] if years else [],
        "features_detected": [
            c for c in [date_col, summ_col, prec_col, temp_col, app_temp_col, hum_col, wind_col, vis_col, press_col]
            if c and not c.startswith("_gen_")
        ],
        "uploaded_at": datetime.utcnow().isoformat()
    }

    return payload, meta


# ==============================================================================
# 3. DATASET & ANALYTICS ENDPOINTS
# ==============================================================================

@app.get("/api/health")
async def health_check():
    """Returns backend system status and active dataset overview."""
    return {
        "status": "healthy",
        "service": "Weather Analytics Backend (FastAPI)",
        "has_data": ACTIVE_DATA is not None,
        "active_dataset": ACTIVE_META.get("dataset_name") if ACTIVE_META else None,
        "is_custom": ACTIVE_META.get("is_custom", False) if ACTIVE_META else False,
        "total_records": ACTIVE_META.get("total_cleaned_records", 0) if ACTIVE_META else 0,
        "duplicates_removed": ACTIVE_META.get("duplicate_records", 0) if ACTIVE_META else 0,
    }


@app.get("/api/dataset/status")
async def dataset_status():
    """Checks whether a dataset is currently loaded on the backend."""
    return {
        "has_dataset": ACTIVE_DATA is not None,
        "meta": ACTIVE_META,
    }


@app.get("/api/weather")
async def get_weather_data():
    """Retrieves current weather data payload and metadata."""
    global ACTIVE_DATA, ACTIVE_META
    if ACTIVE_DATA is None:
        raise HTTPException(
            status_code=404,
            detail="No dataset has been uploaded yet. Please upload a weather CSV first."
        )

    return {
        "meta": ACTIVE_META,
        "data": ACTIVE_DATA,
    }


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    """Uploads, cleans, and processes a CSV dataset, updating the active dashboard state."""
    global ACTIVE_DATA, ACTIVE_META

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV file.")

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        # Save copy to uploads directory
        saved_path = UPLOADS_DIR / file.filename
        with open(saved_path, "wb") as f:
            f.write(content)

        # PySpark + Cassandra pipeline. Returns None when it is disabled/unavailable or the
        # file needs the original behaviour, in which case the pandas code below runs as before.
        pipeline_result = await run_in_threadpool(pipeline.process_csv_file, saved_path, file.filename)

        if pipeline_result is not None:
            payload, meta = pipeline_result
        else:
            # Try utf-8 first, fallback to latin-1
            try:
                df = pd.read_csv(io.BytesIO(content), encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), encoding="latin-1")

            if df.empty:
                raise HTTPException(status_code=400, detail="CSV file contains no rows.")

            payload, meta = process_weather_dataframe(df, file.filename)

        # Update in-memory active dataset
        ACTIVE_DATA = payload
        ACTIVE_META = meta

        return {
            "success": True,
            "message": f"Successfully processed '{file.filename}'. {meta['total_cleaned_records']} records loaded ({meta['duplicate_records']} duplicates removed).",
            "meta": meta,
            "data": payload,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing CSV: {str(e)}")


@app.post("/api/load-sample")
async def load_sample_dataset():
    """Loads default/sample preprocessed dataset for quick exploration."""
    global ACTIVE_DATA, ACTIVE_META
    
    # Try loading from sample CSV first if exists to do real parsing
    if SAMPLE_CSV_PATH.exists():
        try:
            pipeline_result = await run_in_threadpool(pipeline.process_csv_file, SAMPLE_CSV_PATH, "sample_weather.csv")
            if pipeline_result is not None:
                payload, meta = pipeline_result
            else:
                df = pd.read_csv(SAMPLE_CSV_PATH)
                payload, meta = process_weather_dataframe(df, "sample_weather.csv")
            meta["is_sample"] = True
            ACTIVE_DATA = payload
            ACTIVE_META = meta
            return {
                "success": True,
                "message": f"Loaded sample dataset ({meta['total_cleaned_records']} records).",
                "meta": meta,
                "data": payload,
            }
        except Exception:
            pass

    # Fallback to precomputed JSON
    default_data = load_default_data()
    if not default_data:
        raise HTTPException(status_code=500, detail="Sample dataset could not be found.")

    ACTIVE_DATA = default_data
    ACTIVE_META = {
        "dataset_name": "weatherHistory.csv (Default Sample)",
        "is_custom": False,
        "is_sample": True,
        "total_raw_records": 96453,
        "total_cleaned_records": 96429,
        "duplicate_records": 24,
        "uploaded_at": datetime.utcnow().isoformat(),
        "features_detected": [
            "Formatted Date", "Summary", "Precip Type", "Temperature (C)",
            "Apparent Temperature (C)", "Humidity", "Wind Speed (km/h)",
            "Visibility (km)", "Pressure (millibars)"
        ]
    }

    return {
        "success": True,
        "message": "Loaded default sample weather dataset successfully.",
        "meta": ACTIVE_META,
        "data": ACTIVE_DATA,
    }


@app.post("/api/reset")
async def reset_dataset():
    """Resets the dashboard dataset back to unloaded or sample state."""
    global ACTIVE_DATA, ACTIVE_META
    ACTIVE_DATA = None
    ACTIVE_META = None
    return {
        "success": True,
        "message": "Dataset cleared. Ready for new CSV upload.",
        "has_data": False
    }


@app.get("/api/sample-csv")
async def download_sample_csv():
    """Provides a downloadable sample weather CSV file for testing."""
    if not SAMPLE_CSV_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample CSV not found.")
    return FileResponse(
        path=SAMPLE_CSV_PATH,
        filename="sample_weather.csv",
        media_type="text/csv",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
