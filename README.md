# Weather Data Analysis Using PySpark – Analytics Dashboard
React + Vite + Tailwind CSS + Recharts + Lucide.

## Run
    npm install
    npm run dev          # open http://localhost:5173

## Use your own weatherHistory.csv
    pip install pandas
    python scripts/generate_data.py path/to/weatherHistory.csv   # writes public/weather.json
(`public/weather.json` is already generated from your CSV: 96,453 -> 96,429 rows after duplicate removal.)

## Architecture
PySpark analysis -> weatherHistory.csv -> scripts/generate_data.py (cleaned columnar JSON) -> React dashboard.
All KPIs, charts, tables and correlations are computed in the browser from the real rows, so every filter updates everything.
To use a backend instead, replace the fetch in src/lib.js (useWeather) with your API URL.
