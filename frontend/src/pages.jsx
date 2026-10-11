import {useState} from 'react'
import {Database,Snowflake,Flame,Droplets,Wind,Eye,Gauge,Thermometer,AlertTriangle,ArrowRight} from 'lucide-react'
import {Card,Grid,Kpi,Lines,Bars,Donut,Scat,Tbl,PAL,f2} from './ui'
const pct=(v,n)=>n?f2(v/n*100,1)+'%':'–'
const KP=S=>[[Database,'Total Records',S.n.toLocaleString(),''],[Thermometer,'Average Temperature',f2(S.avg.T),'°C'],[Snowflake,'Minimum Temperature',f2(S.min),'°C'],
  [Flame,'Maximum Temperature',f2(S.max),'°C'],[Droplets,'Average Humidity',f2(S.avg.H*100),'%'],[Wind,'Average Wind Speed',f2(S.avg.W),'km/h'],
  [Eye,'Average Visibility',f2(S.avg.V),'km'],[Gauge,'Average Pressure',f2(S.avg.P),'millibars']]
const Kpis=({S,only})=><div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">{KP(S).filter((_,i)=>!only||only.includes(i)).map((k,i)=><Kpi key={i} icon={k[0]} label={k[1]} value={k[2]} unit={k[3]}/>)}</div>
const Note=({t,children})=><Card title={t}><p className="text-sm mut leading-relaxed">{children}</p></Card>
const ext=[{k:'Date',l:'Date'},{k:'Summary',l:'Summary'}]
const C=(k,l,f)=>({k,l,f})
const Hist=({S})=><Card title="Temperature Distribution"><Bars data={S.hist} colors={[PAL[1]]}/></Card>
const Yr=({S})=><Card title="Yearly Average Temperature"><Lines data={S.yearly} x="k" y="T" unit=" °C"/></Card>
const Mo=({S})=><Card title="Monthly Temperature Trend"><Lines data={S.monthly} x="name" y="T" unit=" °C" color={PAL[1]}/></Card>
const Hr=({S})=><Card title="Hourly Temperature Pattern"><Lines data={S.hourly} x="k" y="T" unit=" °C" color={PAL[2]}/></Card>

const Dash=({S})=><><Kpis S={S}/><Grid c="lg:grid-cols-3"><Yr S={S}/><Mo S={S}/><Hr S={S}/></Grid>
  <Grid c="lg:grid-cols-3"><Card title="Top Weather Conditions"><Bars data={S.summ.slice(0,5)} colors={PAL}/></Card><Hist S={S}/>
  <Card title="Temperature vs Humidity"><Scat data={S.sc} x="T" y="H" xl="Temp °C" yl="Humidity"/><p className="text-xs mut">Correlation: <b>{f2(S.cm[0][2],4)}</b> – noticeable negative relationship (sample of up to 800 points)</p></Card></Grid></>

const FEATS=[['Formatted Date','Date/String','Date and time'],['Summary','Categorical','Weather condition'],['Precip Type','Categorical','Rain/Snow'],['Temperature (C)','Numeric','Temperature'],
['Apparent Temperature (C)','Numeric','Feels-like temperature'],['Humidity','Numeric','Humidity'],['Wind Speed (km/h)','Numeric','Wind speed'],['Wind Bearing (degrees)','Numeric','Wind direction'],
['Visibility (km)','Numeric','Visibility'],['Loud Cover','Numeric','Cloud/cover value'],['Pressure (millibars)','Numeric','Atmospheric pressure'],['Daily Summary','Text','Daily weather summary']].map(([a,b,c])=>({a,b,c}))
const STEPS=['CSV Dataset','Data Loading','Schema Inspection','Missing Value Check','Duplicate Removal','Date Processing','Feature Creation','Aggregation','Analysis','Visualization']
const Overview=({S})=><><Grid c="lg:grid-cols-4"><Kpi icon={Database} label="Dataset" value={S.meta?.dataset_name || "weatherHistory.csv"}/><Kpi icon={Database} label="Original Records" value={(S.meta?.total_raw_records || 96453).toLocaleString()}/>
  <Kpi icon={Database} label="After Duplicate Removal" value={S.n.toLocaleString()}/><Kpi icon={Database} label="Duplicates Removed" value={(S.meta?.duplicate_records ?? 24).toLocaleString()}/></Grid>
  <Card title="Data Processing" className="mb-4"><div className="flex flex-wrap items-center gap-2">{STEPS.map((s,i)=><span key={s} className="flex items-center gap-2"><span className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{background:'rgba(6,182,212,.15)',color:'var(--acc)'}}>{s}</span>{i<STEPS.length-1&&<ArrowRight size={16} className="mut"/>}</span>)}</div></Card>
  <Card title="Features"><Tbl file="features" rows={FEATS} cols={[C('a','Feature'),C('b','Type'),C('c','Description')]}/></Card></>

const Cond=({S})=><><Grid c="lg:grid-cols-2"><Kpi icon={Cloud0} label={`Most Common: ${S.summ[0]?.k??'–'}`} value={(S.summ[0]?.n??0).toLocaleString()} unit="records"/>
  <Kpi icon={Cloud0} label={`Second Most Common: ${S.summ[1]?.k??'–'}`} value={(S.summ[1]?.n??0).toLocaleString()} unit="records"/></Grid>
  <Card title="Top Weather Conditions" className="mb-4"><Bars horizontal x="k" data={S.summ.slice(0,10)} h={380}/></Card>
  <Card title="Condition Statistics (use the Weather Condition filter above)"><Tbl file="conditions" rows={S.summ} cols={[C('k','Weather Condition'),C('n','Records',v=>v.toLocaleString()),C('T','Avg Temperature (°C)',v=>f2(v)),C('H','Avg Humidity',v=>f2(v,3)),C('W','Avg Wind Speed (km/h)',v=>f2(v))]}/></Card></>
function Cloud0(p){return <Database {...p}/>}

const Temp=({S})=><><Kpis S={S} only={[1,2,3]}/><Grid><Card title="Temperature Categories"><Donut data={S.tc} colors={[PAL[1],PAL[5],PAL[4]]}/><p className="text-xs mut">Cold &lt; 10°C · Moderate 10–25°C · Hot ≥ 25°C</p></Card>
  <Note t="Temperature Insights">Moderate ({pct(S.tc[1].value,S.n)}) and cold ({pct(S.tc[0].value,S.n)}) readings dominate; hot readings are {pct(S.tc[2].value,S.n)}. Temperatures range from {f2(S.min)}°C to {f2(S.max)}°C.</Note></Grid>
  <Grid><Hist S={S}/><Mo S={S}/><Yr S={S}/><Hr S={S}/></Grid></>

const HW=({S})=><><h2 className="font-bold text-lg mb-2">Humidity</h2><Grid><Kpi icon={Droplets} label="Average Humidity" value={f2(S.avg.H*100)} unit="%"/>
  <Card title="Humidity Categories"><Donut data={S.hc} colors={[PAL[3],PAL[0],PAL[1]]}/><p className="text-xs mut">Low &lt; 40% · Medium 40–70% · High &gt; 70%</p></Card></Grid>
  <h2 className="font-bold text-lg mb-2">Wind</h2><Grid><Kpi icon={Wind} label="Average Wind Speed" value={f2(S.avg.W)} unit="km/h"/>
  <Card title="Wind Categories"><Bars x="name" y="value" data={S.wc} colors={PAL}/></Card></Grid>
  <Card title="Highest Wind Speed Records"><Tbl file="highest_wind" rows={S.wind} cols={[...ext,C('Wind','Wind Speed (km/h)'),C('Temperature','Temp (°C)'),C('Humidity','Humidity')]}/></Card></>

function Time({S}){const [t,setT]=useState('Yearly');const m=[['T','Avg Temperature','°C'],['H','Avg Humidity','']]
  const Tab=({d,x,keys})=><Grid>{keys.map(([y,l,u],i)=><Card key={y} title={l}><Lines data={d} x={x} y={y} unit={u} color={PAL[i]}/></Card>)}</Grid>
  return <><div className="flex gap-2 mb-4">{['Yearly','Monthly','Hourly'].map(x=><button key={x} onClick={()=>setT(x)} className={t===x?'btn':'card !py-1.5 text-sm'}>{x}</button>)}</div>
  {t==='Yearly'&&<Tab d={S.yearly} x="k" keys={[['T','Avg Temperature',' °C'],['H','Avg Humidity',''],['W','Avg Wind Speed',' km/h'],['V','Avg Visibility',' km'],['P','Avg Pressure',' mb']]}/>}
  {t==='Monthly'&&<Tab d={S.monthly} x="name" keys={m}/>}{t==='Hourly'&&<Tab d={S.hourly} x="k" keys={m}/>}
  <Note t="Method">Time-based aggregation was performed using PySpark by extracting Year, Month and Hour from the Formatted Date column.</Note></>}

const L=['Temperature','Apparent Temp','Humidity','Wind Speed','Visibility','Pressure']
const Corr=({S})=><><Card title="Correlation Matrix" className="mb-4"><div className="overflow-x-auto"><table style={{textAlign:'center'}}><thead><tr><th/>{L.map(l=><th key={l}>{l}</th>)}</tr></thead>
  <tbody>{S.cm.map((r,i)=><tr key={i}><td className="font-semibold">{L[i]}</td>{r.map((v,j)=><td key={j} style={{background:v<0?`rgba(239,68,68,${Math.abs(v)})`:`rgba(6,182,212,${Math.abs(v)})`,color:Math.abs(v)>.5?'#fff':'inherit',fontWeight:600}}>{f2(v,3)}</td>)}</tr>)}</tbody></table></div>
  <p className="text-xs mut mt-2">Red = negative, cyan = positive; darker = stronger. Near zero = weak relationship.</p></Card>
  <Grid>{[['H','Humidity'],['W','Wind Speed (km/h)'],['V','Visibility (km)'],['P','Pressure (mb)']].map(([k,l],i)=><Card key={k} title={`Temperature vs ${l}`}><Scat data={S.sc} x="T" y={k} xl="Temp °C" yl={l}/>
  <p className="text-xs mut">r = {f2(S.cm[0][S.vars.indexOf(k)],4)}</p></Card>)}</Grid>
  <Note t="Correlation Insight">Temperature and humidity show a noticeable negative correlation ({f2(S.cm[0][2],4)}), while temperature and wind speed have an almost negligible linear relationship ({f2(S.cm[0][3],4)}).</Note></>

const Ex=({t,rows,cols,file})=><Card title={<span className="flex items-center gap-2"><AlertTriangle size={18} color="#f59e0b"/>{t}</span>}><Tbl file={file} rows={rows} cols={cols}/></Card>
const Extreme=({S})=><Grid c="grid-cols-1"><Ex t="Hottest Records" file="hottest" rows={S.hot} cols={[...ext,C('Temperature','Temperature (°C)'),C('Humidity','Humidity')]}/>
  <Ex t="Coldest Records" file="coldest" rows={S.cold} cols={[...ext,C('Temperature','Temperature (°C)'),C('Humidity','Humidity')]}/>
  <Ex t="Highest Wind Speed" file="wind" rows={S.wind} cols={[...ext,C('Wind','Wind Speed (km/h)'),C('Temperature','Temp (°C)'),C('Humidity','Humidity')]}/>
  <Ex t="Lowest Visibility" file="visibility" rows={S.vis} cols={[...ext,C('Visibility','Visibility (km)'),C('Temperature','Temp (°C)')]}/></Grid>

const Precip=({S})=>{const g=k=>S.pr.find(p=>p.k===k)?.n??0
  return <><Grid><Card title="Precipitation Type"><Donut data={S.pr.map(p=>({name:p.k==='Missing'?'Missing (null)':p.k,value:p.n}))} colors={[PAL[1],PAL[0],PAL[3]]}/></Card>
  <Kpi icon={Droplets} label="Rain Dominance" value={pct(g('rain'),S.n)} unit="of records have rain"/></Grid>
  <Card title="Statistics by Precipitation Type" className="mb-4"><Tbl file="precip_stats" rows={S.pr} cols={[C('k','Precipitation Type'),C('n','Record Count',v=>v.toLocaleString()),C('T','Avg Temp (°C)',v=>f2(v)),C('H','Avg Humidity',v=>f2(v,3)),C('W','Avg Wind (km/h)',v=>f2(v))]}/></Card>
  <Card title="Weather Conditions by Precipitation Type"><Tbl file="precip_conditions" rows={S.prSumm} cols={[C('Precip','Precipitation'),C('Summary','Weather Condition'),C('n','Records',v=>v.toLocaleString())]}/></Card></>}

const Insights=({S})=>{const t=S.summ[0]
  const I=[`${t?.k} is the most frequently observed weather condition.`,`Average temperature is approximately ${f2(S.avg.T)}°C.`,`Observed temperatures range from approximately ${f2(S.min)}°C to ${f2(S.max)}°C.`,
  `Average humidity is approximately ${f2(S.avg.H*100)}%.`,`Temperature and humidity have a negative correlation of approximately ${f2(S.cm[0][2],4)}.`,
  `Temperature and wind speed have almost no linear correlation, approximately ${f2(S.cm[0][3],4)}.`,`Rain is much more common than snow in the dataset.`,`Moderate and cold temperatures represent the largest temperature categories.`]
  return <><h2 className="font-bold text-xl mb-3">Key Findings</h2><Grid c="md:grid-cols-2 xl:grid-cols-4">{I.map((x,i)=><Card key={i}><Lightb/><p className="text-sm font-medium mt-2">{x}</p></Card>)}</Grid>
  <Note t="Project Conclusion">PySpark enables efficient processing and aggregation of large-scale weather data. The analysis reveals clear patterns in temperature, humidity, weather conditions and time-based trends. These insights demonstrate how Big Data technologies can be used to understand historical weather patterns.</Note></>}
const Lightb=()=><Gauge size={20} style={{color:'var(--acc)'}}/>
export const Pages=[Dash,Overview,Cond,Temp,HW,Time,Corr,Extreme,Precip,Insights]
