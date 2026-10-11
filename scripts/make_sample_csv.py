import json, csv

data = json.load(open('public/weather.json', 'r', encoding='utf-8'))
summ = data['summ']
prec = data['prec']

fieldnames = [
    'Formatted Date', 'Summary', 'Precip Type',
    'Temperature (C)', 'Apparent Temperature (C)', 'Humidity',
    'Wind Speed (km/h)', 'Wind Bearing (degrees)', 'Visibility (km)',
    'Loud Cover', 'Pressure (millibars)', 'Daily Summary'
]

rows = []
n = min(1500, len(data['y']))
for i in range(n):
    p_val = prec[data['p'][i]] if data['p'][i] >= 0 else ''
    s_val = summ[data['s'][i]]
    rows.append({
        'Formatted Date': f"{data['d'][i]}:00.000 +0200",
        'Summary': s_val,
        'Precip Type': p_val,
        'Temperature (C)': data['T'][i],
        'Apparent Temperature (C)': data['A'][i],
        'Humidity': data['H'][i],
        'Wind Speed (km/h)': data['W'][i],
        'Wind Bearing (degrees)': 180.0,
        'Visibility (km)': data['V'][i],
        'Loud Cover': 0.0,
        'Pressure (millibars)': data['P'][i],
        'Daily Summary': f"{s_val} throughout the day."
    })

# Add a few duplicate rows to demonstrate deduplication
rows.append(rows[0])
rows.append(rows[5])

for target in ['public/sample_weather.csv', 'backend/sample_weather.csv']:
    with open(target, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

print('Sample CSV created successfully with', len(rows), 'records!')
