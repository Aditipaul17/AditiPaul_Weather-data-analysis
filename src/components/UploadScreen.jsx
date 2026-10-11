import { useState, useRef } from 'react'
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle,
  Download, Sparkles, RefreshCw, LogOut, Server, Database,
  ArrowRight, ShieldCheck, HelpCircle
} from 'lucide-react'

export function UploadScreen({ user, onUpload, onLoadSample, onLogout, backendOnline }) {
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please provide a valid .csv file.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err.message || 'Error processing the uploaded CSV file.')
    } finally {
      setLoading(false)
    }
  }

  const handleSampleClick = async () => {
    setLoadingSample(true)
    setError(null)
    try {
      await onLoadSample()
    } catch (err) {
      setError(err.message || 'Failed to load sample dataset.')
    } finally {
      setLoadingSample(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#071022' }}>
      {/* Top Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Database size={20} />
          </div>
          <div>
            <div className="font-extrabold text-base text-white tracking-wide">WEATHER ANALYTICS PLATFORM</div>
            <div className="text-[11px] text-cyan-400/80 font-medium">Decoupled Architecture • FastAPI &amp; React</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <Server size={14} className={backendOnline ? "text-emerald-400" : "text-amber-400"} />
            <span className="text-slate-300 font-medium">
              {backendOnline ? 'FastAPI Backend Online' : 'Client In-Browser Mode'}
            </span>
          </div>

          {/* User profile pill */}
          <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
            <div className="text-right hidden md:block">
              <div className="text-xs font-bold text-white">{user?.name || 'Active User'}</div>
              <div className="text-[10px] text-cyan-300">{user?.role || 'Analyst'}</div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
              title="Log Out"
            >
              <LogOut size={14} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl">
          {/* Welcome Message */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
              <Sparkles size={14} />
              Step 2: Load Weather Dataset
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Upload Your Weather CSV
            </h1>
            <p className="mut text-sm sm:text-base mt-2 max-w-xl mx-auto">
              Welcome, <span className="text-cyan-300 font-semibold">{user?.name}</span>! Upload any weather dataset to begin data exploration, trend analysis, and correlation insights.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold">Upload Error</div>
                <div className="text-xs mt-0.5 text-rose-200/90">{error}</div>
              </div>
            </div>
          )}

          {/* Main Upload Area */}
          <div className="card !p-8 border border-slate-700/80 shadow-2xl rounded-3xl bg-slate-900/90 relative overflow-hidden text-white">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 sm:p-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                dragActive
                  ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
                  : 'border-slate-700 hover:border-cyan-500/60 bg-slate-950/40 hover:bg-slate-950/70'
              }`}
            >
              <div className="w-20 h-20 rounded-3xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/10">
                {loading ? (
                  <RefreshCw size={36} className="animate-spin text-cyan-300" />
                ) : (
                  <UploadCloud size={38} />
                )}
              </div>

              {loading ? (
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Processing Dataset...</h3>
                  <p className="text-xs text-cyan-300/90">
                    FastAPI is removing duplicates, standardizing timestamps, and calculating statistical metrics.
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    Drag and drop your Weather CSV file here
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                    Supports any standard weather dataset. Automatic deduplication and normalization applied.
                  </p>
                  <button
                    type="button"
                    className="btn !bg-cyan-500 hover:!bg-cyan-400 !text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-cyan-500/20"
                  >
                    Browse Files
                  </button>
                </div>
              )}
            </div>

            {/* Alternative: Use Sample or Download */}
            <div className="mt-6 pt-6 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading || loadingSample}
                  onClick={handleSampleClick}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {loadingSample ? (
                    <RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} className="text-cyan-400" />
                  )}
                  <span>Use Sample Dataset (weatherHistory.csv • 96k records)</span>
                </button>
              </div>

              <a
                href="/api/sample-csv"
                download="sample_weather.csv"
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <Download size={14} className="text-slate-400" />
                <span>Download Sample CSV template</span>
              </a>
            </div>
          </div>

          {/* Schema Details & Instructions */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card !p-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-xs">
              <div className="font-bold text-white mb-1 flex items-center gap-1.5 text-cyan-300">
                <CheckCircle2 size={15} /> Required Columns
              </div>
              <p className="mut text-[11px] leading-relaxed">
                CSV needs at least a Date column (e.g. <code className="text-slate-300">Formatted Date</code>) and Temperature column (<code className="text-slate-300">Temperature (C)</code>).
              </p>
            </div>

            <div className="card !p-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-xs">
              <div className="font-bold text-white mb-1 flex items-center gap-1.5 text-cyan-300">
                <CheckCircle2 size={15} /> Automated Cleaning
              </div>
              <p className="mut text-[11px] leading-relaxed">
                Duplicates are dropped, missing numeric features filled, and categorical conditions mapped to index arrays automatically.
              </p>
            </div>

            <div className="card !p-4 bg-slate-900/50 border border-slate-800 rounded-2xl text-xs">
              <div className="font-bold text-white mb-1 flex items-center gap-1.5 text-cyan-300">
                <CheckCircle2 size={15} /> 10 Analytical Modules
              </div>
              <p className="mut text-[11px] leading-relaxed">
                Once uploaded, unlock 10 interactive analytics pages including Pearson correlation heatmaps and time trends.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
