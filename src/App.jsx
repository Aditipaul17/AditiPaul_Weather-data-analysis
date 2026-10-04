import {useState,useMemo,useEffect} from 'react'
import {LayoutDashboard,Database,Cloud,Thermometer,Droplets,Clock,GitCompare,AlertTriangle,CloudRain,Lightbulb,Sun,Moon,Menu} from 'lucide-react'
import {useWeather,compute} from './lib'
import {Pages} from './pages'
const NAV=[['Dashboard',LayoutDashboard],['Dataset Overview',Database],['Weather Conditions',Cloud],['Temperature Analysis',Thermometer],['Humidity & Wind',Droplets],['Time Trends',Clock],['Correlation Analysis',GitCompare],['Extreme Weather',AlertTriangle],['Precipitation',CloudRain],['Insights',Lightbulb]]
const Sel=({l,v,set,opts})=><label className="text-xs mut flex flex-col gap-1">{l}<select value={v} onChange={e=>set(e.target.value)}><option value="all">All</option>{opts.map(o=><option key={o}>{o}</option>)}</select></label>
export default function App(){
  const [D,err]=useWeather(),[page,setPage]=useState(0),[dark,setDark]=useState(true),[open,setOpen]=useState(false)
  const [f,setF]=useState({year:'all',cond:'all',prec:'all',tcat:'all'})
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark])
  const S=useMemo(()=>D&&compute(D,f),[D,f]),P=Pages[page],up=k=>v=>setF(o=>({...o,[k]:v}))
  return <div className="min-h-screen flex">
    <aside className={`fixed lg:sticky top-0 h-screen w-64 z-20 p-5 text-white flex-shrink-0 transition-transform ${open?'':'-translate-x-full lg:translate-x-0'}`} style={{background:'#0a1a3a'}}>
      <div className="font-extrabold text-lg tracking-wide">WEATHER ANALYTICS</div><div className="text-xs text-cyan-300 mb-6">Powered by PySpark</div>
      <nav className="flex flex-col gap-1">{NAV.map(([n,I],i)=><button key={n} onClick={()=>{setPage(i);setOpen(false)}} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left ${i===page?'bg-cyan-500/20 text-cyan-300 font-semibold':'text-slate-300 hover:bg-white/10'}`}><I size={17}/>{n}</button>)}</nav></aside>
    <main className="flex-1 min-w-0 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex items-start gap-3"><button className="lg:hidden card !p-2" onClick={()=>setOpen(!open)} aria-label="Menu"><Menu size={18}/></button>
          <div><h1 className="text-2xl font-extrabold">Weather Data Analysis</h1><p className="mut text-sm">Big Data Analytics powered by PySpark</p>
          <div className="flex flex-wrap gap-2 mt-2 text-xs"><span className="px-2 py-1 rounded-full" style={{background:'rgba(6,182,212,.15)',color:'var(--acc)'}}>PySpark • 96K+ Records • 12 Features</span><span className="text-emerald-500 font-semibold py-1">● Analysis Complete</span></div></div></div>
        <button className="card !p-2" onClick={()=>setDark(!dark)} aria-label="Toggle theme">{dark?<Sun size={18}/>:<Moon size={18}/>}</button></header>
      {D&&<div className="card mb-4 flex flex-wrap gap-4 items-end"><Sel l="Year" v={f.year} set={up('year')} opts={[...new Set(D.y)].sort()}/><Sel l="Weather Condition" v={f.cond} set={up('cond')} opts={D.summ}/>
        <Sel l="Precipitation" v={f.prec} set={up('prec')} opts={[...D.prec,'Missing']}/><Sel l="Temperature Category" v={f.tcat} set={up('tcat')} opts={['Cold','Moderate','Hot']}/>
        <button className="btn" onClick={()=>setF({year:'all',cond:'all',prec:'all',tcat:'all'})}>Reset</button></div>}
      {err&&<div className="card">Could not load <code>/weather.json</code>. Run <code>python scripts/generate_data.py weatherHistory.csv</code> first.</div>}
      {!D&&!err&&<div className="card">Loading data…</div>}
      {S&&<div key={page} className="fade"><P S={S}/></div>}
      <footer className="mut text-xs text-center mt-8">Weather Data Analysis | Big Data Analytics Project | PySpark</footer></main></div>
}
