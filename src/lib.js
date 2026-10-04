import {useEffect,useState} from 'react'
export const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const tcat=t=>t<10?'Cold':t<25?'Moderate':'Hot'
export const wcat=w=>w<10?'Low':w<25?'Moderate':'High'
export const hcat=h=>h<.4?'Low':h<=.7?'Medium':'High'
export function useWeather(){
  const [D,setD]=useState(null),[err,setErr]=useState(null)
  useEffect(()=>{
    const base = import.meta.env.BASE_URL || '/'
    const url = `${base.replace(/\/$/, '')}/weather.json`
    fetch(url).then(r=>{if(!r.ok)throw 0;return r.json()}).then(setD).catch(()=>setErr(true))
  },[])
  return [D,err]
}
const COLS=['T','H','W','V','P']
function agg(D,idx,key,cols=COLS){
  const g=new Map()
  for(const i of idx){const k=key(i);let o=g.get(k);if(!o){o={k,n:0};cols.forEach(c=>o[c]=0);g.set(k,o)}o.n++;cols.forEach(c=>o[c]+=D[c][i])}
  return [...g.values()].map(o=>{cols.forEach(c=>o[c]/=o.n);return o})
}
function corr(a,b){const n=a.length;if(!n)return 0;let sa=0,sb=0;for(let i=0;i<n;i++){sa+=a[i];sb+=b[i]}sa/=n;sb/=n
  let c=0,x=0,y=0;for(let i=0;i<n;i++){const u=a[i]-sa,v=b[i]-sb;c+=u*v;x+=u*u;y+=v*v}return c/Math.sqrt(x*y)}
export function compute(D,f){
  const idx=[]
  for(let i=0;i<D.y.length;i++){
    if(f.year!=='all'&&D.y[i]!==+f.year)continue
    if(f.cond!=='all'&&D.summ[D.s[i]]!==f.cond)continue
    if(f.prec!=='all'&&(D.p[i]<0?'Missing':D.prec[D.p[i]])!==f.prec)continue
    if(f.tcat!=='all'&&tcat(D.T[i])!==f.tcat)continue
    idx.push(i)
  }
  const n=idx.length,avg={},col=c=>idx.map(i=>D[c][i])
  COLS.concat('A').forEach(c=>{let s=0;for(const i of idx)s+=D[c][i];avg[c]=n?s/n:0})
  const T=col('T'),byN=a=>a.sort((x,y)=>y.n-x.n)
  const nm=i=>D.summ[D.s[i]],pn=i=>D.p[i]<0?'Missing':D.prec[D.p[i]]
  const step=Math.max(1,Math.ceil(n/800))
  const ext=(c,desc)=>[...idx].sort((a,b)=>desc?D[c][b]-D[c][a]:D[c][a]-D[c][b]).slice(0,10)
    .map(i=>({Date:D.d[i],Summary:nm(i),Temperature:D.T[i],Humidity:D.H[i],Wind:D.W[i],Visibility:D.V[i]}))
  const hist=Array.from({length:31},(_,b)=>({k:`${-22+b*2}`,n:0}))
  T.forEach(t=>{hist[Math.min(30,Math.max(0,Math.floor((t+22)/2)))].n++})
  const vars=['T','A','H','W','V','P'],vc=vars.map(col),pj={}
  idx.forEach(i=>{const k=pn(i)+'|'+nm(i);pj[k]=(pj[k]||0)+1})
  const cnt=(fn,ks)=>ks.map(k=>({name:k,value:idx.filter(i=>fn(i)===k).length}))
  return {n,avg,min:n?Math.min(...T):0,max:n?Math.max(...T):0,
    yearly:agg(D,idx,i=>D.y[i]).sort((a,b)=>a.k-b.k),
    monthly:agg(D,idx,i=>D.m[i],['T','H']).sort((a,b)=>a.k-b.k).map(o=>({...o,name:MONTHS[o.k-1]})),
    hourly:agg(D,idx,i=>D.h[i],['T','H']).sort((a,b)=>a.k-b.k),
    summ:byN(agg(D,idx,nm,['T','H','W'])),
    tc:cnt(i=>tcat(D.T[i]),['Cold','Moderate','Hot']),wc:cnt(i=>wcat(D.W[i]),['Low','Moderate','High']),
    hc:cnt(i=>hcat(D.H[i]),['Low','Medium','High']),
    pr:byN(agg(D,idx,pn,['T','H','W'])),
    prSumm:Object.entries(pj).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>({Precip:k.split('|')[0],Summary:k.split('|')[1],n:v})),
    hist,hot:ext('T',true),cold:ext('T',false),wind:ext('W',true),vis:ext('V',false),
    sc:idx.filter((_,j)=>j%step===0).map(i=>({T:D.T[i],A:D.A[i],H:D.H[i],W:D.W[i],V:D.V[i],P:D.P[i]})),
    cm:vars.map((_,a)=>vars.map((_,b)=>n?corr(vc[a],vc[b]):0)),vars}
}
