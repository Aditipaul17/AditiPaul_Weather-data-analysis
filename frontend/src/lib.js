import { useEffect, useState, useCallback } from 'react'

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const tcat = t => t < 10 ? 'Cold' : t < 25 ? 'Moderate' : 'Hot'
export const wcat = w => w < 10 ? 'Low' : w < 25 ? 'Moderate' : 'High'
export const hcat = h => h < .4 ? 'Low' : h <= .7 ? 'Medium' : 'High'

export const DEFAULT_META = {
  dataset_name: 'weatherHistory.csv (Default)',
  is_custom: false,
  total_raw_records: 96453,
  total_cleaned_records: 96429,
  duplicate_records: 24,
  features_detected: [
    'Formatted Date', 'Summary', 'Precip Type', 'Temperature (C)',
    'Apparent Temperature (C)', 'Humidity', 'Wind Speed (km/h)',
    'Visibility (km)', 'Pressure (millibars)'
  ]
}

// Base URLs to try connecting to the backend
const API_BASES = ['/api', 'http://127.0.0.1:8000/api', 'http://localhost:8000/api']

async function tryFetch(path, options = {}) {
  const token = localStorage.getItem('wa_auth_token')
  const headers = {
    ...(options.headers || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    headers['x-auth-token'] = token
  }

  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers,
      })
      if (res.ok) return res
      // If server returned 400/401/404/500, return the response so caller can parse detail
      if (res.status >= 400 && res.status < 500) return res
    } catch (_) {}
  }
  return null
}

// =============================================================================
// AUTHENTICATION CLIENT
// =============================================================================

export function getStoredAuth() {
  try {
    const token = localStorage.getItem('wa_auth_token')
    const userStr = localStorage.getItem('wa_auth_user')
    if (token && userStr) {
      return { token, user: JSON.parse(userStr) }
    }
  } catch (_) {}
  return { token: null, user: null }
}

export function saveStoredAuth(token, user) {
  if (token) localStorage.setItem('wa_auth_token', token)
  if (user) localStorage.setItem('wa_auth_user', JSON.stringify(user))
}

export function clearStoredAuth() {
  localStorage.removeItem('wa_auth_token')
  localStorage.removeItem('wa_auth_user')
}

export async function apiLogin(username, password) {
  const res = await tryFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (res) {
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Login failed')
    saveStoredAuth(data.token, data.user)
    return data
  }

  // Client-side fallback if backend server isn't running
  if ((username === 'admin' && password === 'admin123') || (username === 'demo' && password === 'demo123')) {
    const dummyUser = {
      username,
      name: username === 'admin' ? 'Admin Analyst' : 'Demo Researcher',
      role: username === 'admin' ? 'Lead Data Scientist' : 'Meteorologist',
      email: `${username}@weatheranalytics.io`
    }
    const token = 'local_token_' + Date.now()
    saveStoredAuth(token, dummyUser)
    return { success: true, token, user: dummyUser }
  }

  throw new Error('Could not reach backend server and credentials are not recognized.')
}

export async function apiRegister({ username, password, name, email }) {
  const res = await tryFetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, name, email })
  })

  if (res) {
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Registration failed')
    saveStoredAuth(data.token, data.user)
    return data
  }

  // Client-side fallback
  const dummyUser = {
    username,
    name: name || username,
    role: 'Weather Analyst',
    email: email || `${username}@weatheranalytics.io`
  }
  const token = 'local_token_' + Date.now()
  saveStoredAuth(token, dummyUser)
  return { success: true, token, user: dummyUser }
}

export async function apiLogout() {
  try {
    await tryFetch('/auth/logout', { method: 'POST' })
  } catch (_) {}
  clearStoredAuth()
}

export async function apiGetDemoAccounts() {
  try {
    const res = await tryFetch('/auth/demo-credentials')
    if (res && res.ok) {
      const data = await res.json()
      return data.accounts
    }
  } catch (_) {}
  return [
    { username: 'admin', password: 'admin123', name: 'Admin Analyst', role: 'Lead Data Scientist' },
    { username: 'demo', password: 'demo123', name: 'Demo Researcher', role: 'Meteorologist' },
  ]
}

// =============================================================================
// CSV PARSING FALLBACK (IN-BROWSER)
// =============================================================================

export function parseCsvInBrowser(text, filename = 'uploaded.csv') {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV must contain a header row and at least one data row.')

  function parseLine(line) {
    const res = []
    let cur = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else { inQuotes = !inQuotes }
      } else if (c === ',' && !inQuotes) {
        res.push(cur)
        cur = ''
      } else {
        cur += c
      }
    }
    res.push(cur)
    return res.map(s => s.trim().replace(/^"|"$/g, ''))
  }

  const header = parseLine(lines[0])
  const headerLower = header.map(h => h.toLowerCase().trim())

  const findCol = (candidates) => {
    for (const c of candidates) {
      const idx = headerLower.indexOf(c.toLowerCase().trim())
      if (idx !== -1) return idx
    }
    return -1
  }

  const dateIdx = findCol(['Formatted Date', 'Date', 'datetime', 'timestamp', 'Time', 'Date/Time'])
  const summIdx = findCol(['Summary', 'Weather', 'Condition', 'Weather Condition', 'Description', 'Daily Summary'])
  const precIdx = findCol(['Precip Type', 'Precipitation Type', 'Precipitation', 'Precip', 'rain_snow'])
  const tempIdx = findCol(['Temperature (C)', 'Temperature', 'Temp (C)', 'Temp', 'Temperature_C'])
  const appTempIdx = findCol(['Apparent Temperature (C)', 'Apparent Temperature', 'Feels Like (C)', 'Feels Like'])
  const humIdx = findCol(['Humidity', 'humidity', 'Relative Humidity'])
  const windIdx = findCol(['Wind Speed (km/h)', 'Wind Speed', 'Wind', 'wind_speed'])
  const visIdx = findCol(['Visibility (km)', 'Visibility', 'vis', 'visibility'])
  const pressIdx = findCol(['Pressure (millibars)', 'Pressure', 'pressure', 'Pressure_mb'])

  if (dateIdx === -1 || tempIdx === -1) {
    throw new Error("CSV requires at least a date column ('Formatted Date' or 'Date') and temperature column ('Temperature (C)' or 'Temperature').")
  }

  const rawCount = lines.length - 1
  const uniqueLines = new Set()
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (uniqueLines.has(raw)) continue
    uniqueLines.add(raw)
    rows.push(parseLine(raw))
  }
  const dupCount = rawCount - rows.length

  const d = [], y = [], m = [], h = []
  const s = [], p = []
  const T = [], A = [], H = [], W = [], V = [], P = []

  const summSet = new Set()
  const precSet = new Set()
  rows.forEach(r => {
    if (summIdx !== -1 && r[summIdx]) summSet.add(r[summIdx])
    if (precIdx !== -1 && r[precIdx] && r[precIdx] !== 'null') precSet.add(r[precIdx])
  })
  const summ = [...summSet].sort()
  if (summ.length === 0) summ.push('Clear')
  const prec = [...precSet].sort()
  const summMap = new Map(summ.map((val, i) => [val, i]))
  const precMap = new Map(prec.map((val, i) => [val, i]))

  for (const r of rows) {
    const rawDate = r[dateIdx] || ''
    const dt = new Date(rawDate)
    const isValidDate = !isNaN(dt.getTime())
    if (!isValidDate) continue

    const yr = dt.getFullYear()
    const mo = dt.getMonth() + 1
    const hr = dt.getHours()

    const parseNum = (idx, fallback = 0) => {
      if (idx === -1) return fallback
      const val = parseFloat(r[idx])
      return isNaN(val) ? fallback : Math.round(val * 10000) / 10000
    }

    const tVal = parseNum(tempIdx, 0)
    const aVal = appTempIdx !== -1 ? parseNum(appTempIdx, tVal) : tVal
    const hVal = parseNum(humIdx, 0.5)
    const wVal = parseNum(windIdx, 10.0)
    const vVal = parseNum(visIdx, 10.0)
    const pVal = parseNum(pressIdx, 1013.25)

    const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(hr).padStart(2, '0')}:00`

    d.push(dateStr)
    y.push(yr)
    m.push(mo)
    h.push(hr)
    s.push(summMap.get(r[summIdx]) ?? 0)
    p.push(precIdx !== -1 && r[precIdx] ? (precMap.get(r[precIdx]) ?? -1) : -1)
    T.push(tVal)
    A.push(aVal)
    H.push(hVal)
    W.push(wVal)
    V.push(vVal)
    P.push(pVal)
  }

  const detectedFeatures = [
    dateIdx !== -1 ? header[dateIdx] : null,
    summIdx !== -1 ? header[summIdx] : null,
    precIdx !== -1 ? header[precIdx] : null,
    tempIdx !== -1 ? header[tempIdx] : null,
    appTempIdx !== -1 ? header[appTempIdx] : null,
    humIdx !== -1 ? header[humIdx] : null,
    windIdx !== -1 ? header[windIdx] : null,
    visIdx !== -1 ? header[visIdx] : null,
    pressIdx !== -1 ? header[pressIdx] : null,
  ].filter(Boolean)

  const meta = {
    dataset_name: filename,
    is_custom: true,
    total_raw_records: rawCount,
    total_cleaned_records: y.length,
    duplicate_records: dupCount,
    year_range: y.length ? [Math.min(...y), Math.max(...y)] : [],
    features_detected: detectedFeatures,
  }

  return {
    data: { summ, prec, d, y, m, h, s, p, T, A, H, W, V, P },
    meta
  }
}

// =============================================================================
// MAIN REACT HOOK FOR PLATFORM STATE
// =============================================================================

export function useWeatherPlatform() {
  const [user, setUser] = useState(() => getStoredAuth().user)
  const [token, setToken] = useState(() => getStoredAuth().token)
  // Step: 'login' | 'upload' | 'dashboard'
  const [step, setStep] = useState(() => (getStoredAuth().user ? 'upload' : 'login'))
  const [D, setD] = useState(null)
  const [meta, setMeta] = useState(null)
  const [backendOnline, setBackendOnline] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Check backend health & active dataset status
  const checkStatus = useCallback(async () => {
    try {
      const healthRes = await tryFetch('/health')
      if (healthRes && healthRes.ok) {
        setBackendOnline(true)
        const healthData = await healthRes.json()
        if (healthData.has_data) {
          const weatherRes = await tryFetch('/weather')
          if (weatherRes && weatherRes.ok) {
            const body = await weatherRes.json()
            if (body.data) {
              setD(body.data)
              setMeta(body.meta)
              if (user) setStep('dashboard')
            }
          }
        }
      } else {
        setBackendOnline(false)
      }
    } catch (_) {
      setBackendOnline(false)
    }
  }, [user])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Handle Login
  const handleLogin = (newUser, newToken) => {
    setUser(newUser)
    setToken(newToken)
    if (D) {
      setStep('dashboard')
    } else {
      setStep('upload')
    }
  }

  // Handle Logout
  const handleLogout = async () => {
    await apiLogout()
    setUser(null)
    setToken(null)
    setStep('login')
  }

  // Upload CSV method
  const uploadCsv = async (file) => {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      // 1. Try FastAPI backend
      const res = await tryFetch('/upload', {
        method: 'POST',
        body: formData,
      })

      if (res && res.ok) {
        const result = await res.json()
        if (result.success && result.data) {
          setD(result.data)
          setMeta(result.meta)
          setBackendOnline(true)
          setStep('dashboard')
          return { data: result.data, meta: result.meta, backendUsed: true }
        }
      }

      // 2. Fallback to client browser processing
      const text = await file.text()
      const { data: parsedData, meta: parsedMeta } = parseCsvInBrowser(text, file.name)
      setD(parsedData)
      setMeta(parsedMeta)
      setStep('dashboard')
      return { data: parsedData, meta: parsedMeta, backendUsed: false }
    } catch (err) {
      setError(err.message || 'Failed to upload and process CSV')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Load sample dataset
  const loadSample = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Try backend sample loader
      const res = await tryFetch('/load-sample', { method: 'POST' })
      if (res && res.ok) {
        const result = await res.json()
        if (result.success && result.data) {
          setD(result.data)
          setMeta(result.meta)
          setBackendOnline(true)
          setStep('dashboard')
          return result
        }
      }

      // 2. Fallback to static weather.json
      const base = import.meta.env.BASE_URL || '/'
      const url = `${base.replace(/\/$/, '')}/weather.json`
      const r = await fetch(url)
      if (!r.ok) throw new Error('Could not load sample weather.json')
      const json = await r.json()
      setD(json)
      setMeta(DEFAULT_META)
      setStep('dashboard')
      return { data: json, meta: DEFAULT_META, backendUsed: false }
    } catch (err) {
      setError(err.message || 'Failed to load sample dataset')
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Reset dataset
  const resetDataset = async () => {
    try {
      await tryFetch('/reset', { method: 'POST' })
    } catch (_) {}
    setD(null)
    setMeta(null)
    setStep('upload')
  }

  return {
    user,
    token,
    step,
    setStep,
    D,
    meta,
    loading,
    error,
    backendOnline,
    handleLogin,
    handleLogout,
    uploadCsv,
    loadSample,
    resetDataset,
  }
}

// =============================================================================
// STATISTICAL & COMPUTATIONAL ENGINE
// =============================================================================

const COLS = ['T', 'H', 'W', 'V', 'P']

function agg(D, idx, key, cols = COLS) {
  const g = new Map()
  for (const i of idx) {
    const k = key(i)
    let o = g.get(k)
    if (!o) {
      o = { k, n: 0 }
      cols.forEach(c => o[c] = 0)
      g.set(k, o)
    }
    o.n++
    cols.forEach(c => o[c] += D[c][i])
  }
  return [...g.values()].map(o => {
    cols.forEach(c => o[c] /= o.n)
    return o
  })
}

function corr(a, b) {
  const n = a.length
  if (!n) return 0
  let sa = 0, sb = 0
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i] }
  sa /= n; sb /= n
  let c = 0, x = 0, y = 0
  for (let i = 0; i < n; i++) {
    const u = a[i] - sa, v = b[i] - sb
    c += u * v; x += u * u; y += v * v
  }
  return c / Math.sqrt(x * y)
}

export function compute(D, f, meta = null) {
  const idx = []
  for (let i = 0; i < D.y.length; i++) {
    if (f.year !== 'all' && D.y[i] !== +f.year) continue
    if (f.cond !== 'all' && D.summ[D.s[i]] !== f.cond) continue
    if (f.prec !== 'all' && (D.p[i] < 0 ? 'Missing' : D.prec[D.p[i]]) !== f.prec) continue
    if (f.tcat !== 'all' && tcat(D.T[i]) !== f.tcat) continue
    idx.push(i)
  }

  const n = idx.length, avg = {}, col = c => idx.map(i => D[c][i])
  COLS.concat('A').forEach(c => {
    let s = 0
    for (const i of idx) s += D[c][i]
    avg[c] = n ? s / n : 0
  })

  const T = col('T'), byN = a => a.sort((x, y) => y.n - x.n)
  const nm = i => D.summ[D.s[i]], pn = i => D.p[i] < 0 ? 'Missing' : D.prec[D.p[i]]
  const step = Math.max(1, Math.ceil(n / 800))
  const ext = (c, desc) => [...idx].sort((a, b) => desc ? D[c][b] - D[c][a] : D[c][a] - D[c][b]).slice(0, 10)
    .map(i => ({ Date: D.d[i], Summary: nm(i), Temperature: D.T[i], Humidity: D.H[i], Wind: D.W[i], Visibility: D.V[i] }))

  const hist = Array.from({ length: 31 }, (_, b) => ({ k: `${-22 + b * 2}`, n: 0 }))
  T.forEach(t => { hist[Math.min(30, Math.max(0, Math.floor((t + 22) / 2)))].n++ })

  const vars = ['T', 'A', 'H', 'W', 'V', 'P'], vc = vars.map(col), pj = {}
  idx.forEach(i => { const k = pn(i) + '|' + nm(i); pj[k] = (pj[k] || 0) + 1 })
  const cnt = (fn, ks) => ks.map(k => ({ name: k, value: idx.filter(i => fn(i) === k).length }))

  return {
    meta,
    n, avg, min: n ? Math.min(...T) : 0, max: n ? Math.max(...T) : 0,
    yearly: agg(D, idx, i => D.y[i]).sort((a, b) => a.k - b.k),
    monthly: agg(D, idx, i => D.m[i], ['T', 'H']).sort((a, b) => a.k - b.k).map(o => ({ ...o, name: MONTHS[o.k - 1] })),
    hourly: agg(D, idx, i => D.h[i], ['T', 'H']).sort((a, b) => a.k - b.k),
    summ: byN(agg(D, idx, nm, ['T', 'H', 'W'])),
    tc: cnt(i => tcat(D.T[i]), ['Cold', 'Moderate', 'Hot']),
    wc: cnt(i => wcat(D.W[i]), ['Low', 'Moderate', 'High']),
    hc: cnt(i => hcat(D.H[i]), ['Low', 'Medium', 'High']),
    pr: byN(agg(D, idx, pn, ['T', 'H', 'W'])),
    prSumm: Object.entries(pj).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ Precip: k.split('|')[0], Summary: k.split('|')[1], n: v })),
    hist, hot: ext('T', true), cold: ext('T', false), wind: ext('W', true), vis: ext('V', false),
    sc: idx.filter((_, j) => j % step === 0).map(i => ({ T: D.T[i], A: D.A[i], H: D.H[i], W: D.W[i], V: D.V[i], P: D.P[i] })),
    cm: vars.map((_, a) => vars.map((_, b) => n ? corr(vc[a], vc[b]) : 0)),
    vars
  }
}
