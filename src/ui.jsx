import {useState,useMemo} from 'react'
import {ResponsiveContainer,LineChart,Line,BarChart,Bar,PieChart,Pie,Cell,ScatterChart,Scatter,XAxis,YAxis,CartesianGrid,Tooltip,Legend,Brush} from 'recharts'
export const PAL=['#06b6d4','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#10b981']
export const f2=(n,d=2)=>Number(n).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d})
export const Card=({title,children,className=''})=><section className={`card ${className}`}>{title&&<h3 className="font-bold mb-3">{title}</h3>}{children}</section>
export const Grid=({children,c='lg:grid-cols-2'})=><div className={`grid grid-cols-1 ${c} gap-4 mb-4`}>{children}</div>
export const Kpi=({icon:I,label,value,unit})=><div className="card flex items-center gap-3">
  <div className="p-2.5 rounded-xl" style={{background:'rgba(6,182,212,.15)',color:'var(--acc)'}}><I size={22}/></div>
  <div><div className="mut text-xs font-medium">{label}</div><div className="text-xl font-extrabold">{value}<span className="text-xs mut ml-1">{unit}</span></div></div></div>
const Box=({h=260,children})=><div style={{height:h}}><ResponsiveContainer>{children}</ResponsiveContainer></div>
export const Lines=({data,x,y,unit='',color=PAL[0],h})=><Box h={h}><LineChart data={data} margin={{right:12}}>
  <CartesianGrid/><XAxis dataKey={x}/><YAxis domain={['auto','auto']} tickFormatter={v=>f2(v,y==='H'?2:0)}/>
  <Tooltip formatter={v=>[f2(v,3)+unit]}/><Line dataKey={y} stroke={color} strokeWidth={2.5} dot={{r:3}}/><Brush height={16} stroke={color}/></LineChart></Box>
export const Bars=({data,x='k',y='n',horizontal,h,colors})=><Box h={h}><BarChart data={data} layout={horizontal?'vertical':'horizontal'} margin={{left:horizontal?30:0}}>
  <CartesianGrid/>{horizontal?<><XAxis type="number"/><YAxis type="category" dataKey={x} width={150}/></>:<><XAxis dataKey={x}/><YAxis/></>}
  <Tooltip formatter={v=>[f2(v,0),'Records']}/><Bar dataKey={y} fill={PAL[0]}>{colors&&data.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Bar></BarChart></Box>
export const Donut=({data,colors=PAL})=><Box><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
  {data.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={v=>f2(v,0)}/><Legend/></PieChart></Box>
export const Scat=({data,x,y,xl,yl})=><Box><ScatterChart margin={{right:12}}><CartesianGrid/>
  <XAxis type="number" dataKey={x} name={xl} domain={['auto','auto']}/><YAxis type="number" dataKey={y} name={yl} domain={['auto','auto']}/>
  <Tooltip cursor={{strokeDasharray:'3 3'}}/><Scatter data={data} fill={PAL[0]} fillOpacity={.5}/></ScatterChart></Box>
export function Tbl({cols,rows,file='table'}){
  const [q,setQ]=useState(''),[s,setS]=useState(null)
  const r=useMemo(()=>{let a=rows.filter(o=>!q||Object.values(o).join(' ').toLowerCase().includes(q.toLowerCase()))
    if(s)a=[...a].sort((x,y)=>(x[s.k]>y[s.k]?1:-1)*s.d);return a},[rows,q,s])
  const dl=()=>{const t=[cols.map(c=>c.l).join(','),...r.map(o=>cols.map(c=>JSON.stringify(o[c.k]??'')).join(','))].join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv'}));a.download=file+'.csv';a.click()}
  return <div><div className="flex gap-2 mb-2 justify-end"><input placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)}/><button className="btn" onClick={dl}>Download CSV</button></div>
    <div className="overflow-x-auto" style={{maxHeight:400}}><table><thead><tr>{cols.map(c=><th key={c.k} onClick={()=>setS(p=>({k:c.k,d:p&&p.k===c.k?-p.d:1}))}>{c.l}{s&&s.k===c.k?(s.d>0?' ▲':' ▼'):''}</th>)}</tr></thead>
    <tbody>{r.map((o,i)=><tr key={i}>{cols.map(c=><td key={c.k}>{c.f?c.f(o[c.k]):o[c.k]}</td>)}</tr>)}</tbody></table></div></div>
}
