import { useState, useRef } from 'react'
import { UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet, Download, RefreshCw, X, Server, Sparkles } from 'lucide-react'

export function UploadModal({ isOpen, onClose, onUpload, onReset, meta, backendOnline }) {
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const inputRef = useRef(null)

  if (!isOpen) return null

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
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  const processFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid .csv file.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await onUpload(file)
      setSuccess({
        filename: file.name,
        records: res.meta?.total_cleaned_records || res.meta?.total_raw_records,
        duplicates: res.meta?.duplicate_records || 0,
        backend: res.backendUsed ? 'FastAPI Backend' : 'Browser Engine'
      })
    } catch (err) {
      setError(err.message || 'Failed to process CSV file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto !p-6 shadow-2xl relative border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-700/60 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
              <UploadCloud size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Upload Weather CSV Dataset</h2>
              <p className="text-xs mut">Upload any weather CSV to analyze and explore in the dashboard</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Backend Status Banner */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 mb-5 text-xs">
          <div className="flex items-center gap-2">
            <Server size={15} className={backendOnline ? "text-emerald-400" : "text-amber-400"} />
            <span className="font-semibold text-slate-200">Data Processing Engine:</span>
            {backendOnline ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                ● FastAPI Backend Active (Port 8000)
              </span>
            ) : (
              <span className="text-amber-400 font-medium flex items-center gap-1">
                ● In-Browser Engine (Client Fallback)
              </span>
            )}
          </div>
          <span className="text-slate-400 hidden sm:inline">Deduplication &amp; Aggregation</span>
        </div>

        {/* Dropzone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
              : 'border-slate-600 hover:border-cyan-500 hover:bg-slate-800/40'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleChange}
          />

          <div className="flex flex-col items-center justify-center gap-3">
            <div className="p-3 rounded-full bg-cyan-500/10 text-cyan-400">
              <FileSpreadsheet size={36} />
            </div>
            <div>
              <p className="font-semibold text-base">
                Drop your CSV dataset here, or <span className="text-cyan-400 hover:underline">browse files</span>
              </p>
              <p className="text-xs mut mt-1">Supports weather datasets with date, temperature, humidity, etc.</p>
            </div>
            <span className="px-3 py-1 text-xs rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              CSV format only
            </span>
          </div>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-5 text-cyan-400">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm font-semibold">Processing &amp; analyzing dataset...</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 mt-4 text-xs">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm text-emerald-200">Dataset Loaded Successfully!</p>
                <p className="mt-1">
                  <b>{success.filename}</b>: <b>{success.records.toLocaleString()}</b> records ready for exploration.
                  {success.duplicates > 0 && <span> (Removed <b>{success.duplicates}</b> duplicate rows).</span>}
                </p>
                <p className="mut mt-1 text-[11px]">Processed via {success.backend}. All dashboard tabs are now updated.</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 mt-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-rose-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm text-rose-200">Upload Failed</p>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Current Active Dataset Summary */}
        {meta && (
          <div className="mt-5 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="mut">Current Active Dataset: </span>
                <span className="font-semibold text-white">{meta.dataset_name}</span>
                <span className="mut ml-2">({(meta.total_cleaned_records || 0).toLocaleString()} rows)</span>
              </div>
              {meta.is_custom && (
                <button
                  onClick={async () => {
                    await onReset()
                    setSuccess(null)
                  }}
                  className="btn !py-1 !px-2.5 text-xs flex items-center gap-1.5"
                >
                  <RefreshCw size={13} /> Reset to Default
                </button>
              )}
            </div>
          </div>
        )}

        {/* Expected Schema Guidelines & Sample CSV */}
        <div className="mt-5 pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-slate-300">Need a sample dataset? </span>
            <span className="mut">Test the dashboard instantly with our generated test dataset:</span>
          </div>
          <a
            href="/sample_weather.csv"
            download="sample_weather.csv"
            className="btn !py-1.5 !px-3 text-xs flex items-center gap-1.5"
          >
            <Download size={14} /> Download Sample CSV
          </a>
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn !bg-cyan-500 hover:!bg-cyan-600 !text-black font-bold">
            {success ? 'View Dashboard' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
