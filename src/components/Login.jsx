import { useState, useEffect } from 'react'
import { Cloud, Lock, User, Mail, ShieldCheck, ArrowRight, Sparkles, AlertCircle, RefreshCw } from 'lucide-react'
import { apiLogin, apiRegister, apiGetDemoAccounts } from '../lib'

export function Login({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [demoAccounts, setDemoAccounts] = useState([])

  useEffect(() => {
    apiGetDemoAccounts().then(accounts => setDemoAccounts(accounts || []))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isRegister) {
        if (!username || !password || !name) {
          throw new Error('Please fill in all required fields.')
        }
        const res = await apiRegister({ username, password, name, email })
        onLogin(res.user, res.token)
      } else {
        if (!username || !password) {
          throw new Error('Please enter your username and password.')
        }
        const res = await apiLogin(username, password)
        onLogin(res.user, res.token)
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (acc) => {
    setIsRegister(false)
    setUsername(acc.username)
    setPassword(acc.password)
    setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at top, #0f2552, #060e1e)' }}>
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 mb-3 shadow-lg shadow-cyan-500/10">
            <Cloud size={32} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">WEATHER ANALYTICS</h1>
          <p className="text-xs text-cyan-300/80 mt-1 uppercase tracking-wider font-semibold">
            Big Data Meteorology &amp; Machine Learning Platform
          </p>
        </div>

        {/* Card */}
        <div className="card !p-7 backdrop-blur-xl border border-slate-700/80 shadow-2xl rounded-2xl bg-slate-900/90 text-white">
          {/* Tab Switcher */}
          <div className="flex rounded-xl bg-slate-950/60 p-1 border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => { setIsRegister(false); setError(null) }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                !isRegister ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsRegister(true); setError(null) }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                isRegister ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. John Carter"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-slate-950/60 border border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      placeholder="e.g. researcher@lab.org"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full bg-slate-950/60 border border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-700 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={17} className="animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>{isRegister ? 'Create Account & Continue' : 'Sign In to Analytics'}</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials */}
          {!isRegister && demoAccounts.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={13} className="text-cyan-400" />
                  Quick Demo Accounts (1-Click)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map(acc => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => fillDemo(acc)}
                    className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-all hover:border-cyan-500/50 group"
                  >
                    <div className="text-xs font-bold text-cyan-300 group-hover:text-cyan-200">
                      {acc.username}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {acc.role}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} className="text-cyan-400" />
          <span>Decoupled Frontend &amp; FastAPI Backend • Secure Session</span>
        </div>
      </div>
    </div>
  )
}
