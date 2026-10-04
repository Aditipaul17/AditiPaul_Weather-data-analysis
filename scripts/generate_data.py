"""Cleans weatherHistory.csv (same steps as the PySpark notebook) and writes public/weather.json (columnar)."""
import sys, json, pandas as pd
src = sys.argv[1] if len(sys.argv) > 1 else 'weatherHistory.csv'
df = pd.read_csv(src)
print('Before:', len(df)); df = df.drop_duplicates(); print('After:', len(df))
d = df['Formatted Date']
summ = sorted(df['Summary'].unique()); prec = sorted(df['Precip Type'].dropna().unique())
r = lambda c: df[c].round(4).tolist()
out = dict(summ=summ, prec=prec, d=d.str[:16].tolist(), y=d.str[:4].astype(int).tolist(),
  m=d.str[5:7].astype(int).tolist(), h=d.str[11:13].astype(int).tolist(),
  s=df['Summary'].map({k:i for i,k in enumerate(summ)}).tolist(),
  p=df['Precip Type'].map({k:i for i,k in enumerate(prec)}).fillna(-1).astype(int).tolist(),
  T=r('Temperature (C)'), A=r('Apparent Temperature (C)'), H=r('Humidity'),
  W=r('Wind Speed (km/h)'), V=r('Visibility (km)'), P=r('Pressure (millibars)'))
json.dump(out, open('public/weather.json','w'), separators=(',',':'))
print('Wrote public/weather.json')
