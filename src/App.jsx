import { useState, useMemo, useEffect } from 'react'
import {
  LayoutDashboard, Database, Cloud, Thermometer, Droplets, Clock,
  GitCompare, AlertTriangle, CloudRain, Lightbulb, Sun, Moon, Menu,
  UploadCloud, RefreshCw, Server, CheckCircle2, LogOut, UserCheck
} from 'lucide-react'
import { useWeatherPlatform, compute } from './lib'
import { Pages } from './pages'
import { Login } from './components/Login'
import { UploadScreen } from './components/UploadScreen'
import { UploadModal } from './UploadModal'

const NAV = [
  ['Dashboard', LayoutDashboard],
  ['Dataset Overview', Database],
  ['Weather Conditions', Cloud],
  ['Temperature Analysis', Thermometer],
  ['Humidity & Wind', Droplets],
  ['Time Trends', Clock],
  ['Correlation Analysis', GitCompare],
  ['Extreme Weather', AlertTriangle],
  ['Precipitation', CloudRain],
  ['Insights', Lightbulb]
]

const Sel = ({ l, v, set, opts }) => (
  <label className="text-xs mut flex flex-col gap-1">
    {l}
    <select value={v} onChange={e => set(e.target.value)}>
      <option value="all">All</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </label>
)

export default function App() {
  const {
    user,
    step,
    setStep,
    D,
    meta,
    backendOnline,
    handleLogin,
    handleLogout,
    uploadCsv,
    loadSample,
    resetDataset
  } = useWeatherPlatform()

  const [page, setPage] = useState(0)
  const [dark, setDark] = useState(true)
  const [open, setOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [f, setF] = useState({ year: 'all', cond: 'all', prec: 'all', tcat: 'all' })

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const S = useMemo(() => D && compute(D, f, meta), [D, f, meta])
  const P = Pages[page]
  const up = k => v => setF(o => ({ ...o, [k]: v }))

  // Step 1: Login Screen
  if (step === 'login' || !user) {
    return <Login onLogin={handleLogin} />
  }

  // Step 2: Ask user to upload weather CSV
  if (step === 'upload' || !D) {
    return (
      <UploadScreen
        user={user}
        onUpload={uploadCsv}
        onLoadSample={loadSample}
        onLogout={handleLogout}
        backendOnline={backendOnline}
      />
    )
  }

  // Step 3: Analytics Dashboard
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 h-screen w-64 z-20 p-5 text-white flex-shrink-0 transition-transform ${
          open ? '' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{ background: '#0a1a3a' }}
      >
        <div className="font-extrabold text-lg tracking-wide">WEATHER ANALYTICS</div>
        <div className="text-xs text-cyan-300 mb-4">FastAPI &amp; React Architecture</div>

        {/* User Mini Profile in Sidebar */}
        <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{user?.name}</div>
            <div className="text-[10px] text-cyan-300/80 truncate">{user?.role || 'Analyst'}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>

        {/* Quick Upload Action in Sidebar */}
        <div className="mb-5 pb-4 border-b border-white/10 flex flex-col gap-2">
          <button
            onClick={() => { setUploadModalOpen(true); setOpen(false) }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02]"
          >
            <UploadCloud size={18} />
            <span>Upload New CSV</span>
          </button>

          <button
            onClick={() => setStep('upload')}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors"
          >
            <Database size={14} />
            <span>Switch Dataset</span>
          </button>
        </div>

        <nav className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-320px)]">
          {NAV.map(([n, I], i) => (
            <button
              key={n}
              onClick={() => { setPage(i); setOpen(false) }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                i === page
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <I size={17} />
              {n}
            </button>
          ))}
        </nav>

        {/* Backend status indicator in sidebar bottom */}
        <div className="mt-auto pt-4 border-t border-white/10 text-[11px] text-slate-400 flex items-center gap-2">
          <Server size={13} className={backendOnline ? 'text-emerald-400' : 'text-amber-400'} />
          <span>{backendOnline ? 'FastAPI Backend Online' : 'Client In-Browser Engine'}</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-6">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div className="flex items-start gap-3">
            <button
              className="lg:hidden card !p-2"
              onClick={() => setOpen(!open)}
              aria-label="Menu"
            >
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold">Weather Data Analysis</h1>
              <p className="mut text-sm">Big Data Analytics with CSV Upload &amp; FastAPI Backend</p>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                <span
                  className="px-2.5 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(6,182,212,.15)', color: 'var(--acc)' }}
                >
                  {meta?.dataset_name || 'weather.csv'} • {D ? `${(S?.n || 0).toLocaleString()} Records` : 'Loading...'}
                </span>
                <span className="text-emerald-500 font-semibold py-1 flex items-center gap-1">
                  <CheckCircle2 size={13} /> Analysis Active
                </span>
                <button
                  onClick={resetDataset}
                  className="px-2 py-0.5 rounded text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 font-medium flex items-center gap-1 transition-colors"
                  title="Clear dataset and return to upload view"
                >
                  <RefreshCw size={11} /> Change Dataset
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons on header right */}
          <div className="flex items-center gap-2.5">
            {/* User pill */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
              <UserCheck size={14} className="text-cyan-400" />
              <span className="font-semibold">{user?.name}</span>
            </div>

            <button
              onClick={() => setUploadModalOpen(true)}
              className="btn !bg-cyan-500 hover:!bg-cyan-400 !text-slate-950 font-bold flex items-center gap-2 shadow-sm"
            >
              <UploadCloud size={17} />
              <span className="hidden sm:inline">Upload CSV</span>
            </button>

            <button
              className="card !p-2"
              onClick={() => setDark(!dark)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              onClick={handleLogout}
              className="card !p-2 text-slate-400 hover:text-rose-400 transition-colors"
              title="Log Out"
              aria-label="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Global Filter Bar */}
        {D && (
          <div className="card mb-4 flex flex-wrap gap-4 items-end">
            <Sel l="Year" v={f.year} set={up('year')} opts={[...new Set(D.y)].sort()} />
            <Sel l="Weather Condition" v={f.cond} set={up('cond')} opts={D.summ} />
            <Sel l="Precipitation" v={f.prec} set={up('prec')} opts={[...D.prec, 'Missing']} />
            <Sel l="Temperature Category" v={f.tcat} set={up('tcat')} opts={['Cold', 'Moderate', 'Hot']} />
            <button
              className="btn"
              onClick={() => setF({ year: 'all', cond: 'all', prec: 'all', tcat: 'all' })}
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Active Page View */}
        {S && (
          <div key={page} className="fade">
            <P S={S} />
          </div>
        )}

        {/* Footer */}
        <footer className="mut text-xs text-center mt-8">
          Weather Data Analysis | Big Data Analytics Project | Decoupled React Frontend &amp; FastAPI Backend
        </footer>
      </main>

      {/* Upload Modal Dialog */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={uploadCsv}
        onReset={resetDataset}
        meta={meta}
        backendOnline={backendOnline}
      />
    </div>
  )
}
