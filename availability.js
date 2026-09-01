function cfg(){return {url:process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY}}
const DAY_START=8*60,DAY_END=16*60,DAY_MINUTES=DAY_END-DAY_START;
const PUBLIC_BOOKING_TECHNICIAN='Alfie';
const MAX_BOOKED_RATIO=.75;
const MOT_LEAD_WEEKDAYS=4;
function mins(t){const [h,m]=String(t||'08:00').slice(0,5).split(':').map(Number);return h*60+(m||0)}
function hhmm(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function ymd(d){return d.toISOString().slice(0,10)}
function weekday(d){const n=d.getUTCDay();return n!==0&&n!==6}
function hasMot(types=[],service=''){return [...(Array.isArray(types)?types:[]),service].some(x=>/^mot$/i.test(String(x||'').trim()))}
function durationFor(types=[],service=''){let h=0;const all=[...types]; if(service&&!all.includes(service))all.push(service);for(const t of all){const s=String(t);if(/major service/i.test(s))h+=2.5;else if(/full service/i.test(s))h+=1.5;else if(/interim service/i.test(s))h+=1;else if(/^mot$/i.test(s))h+=1;else if(/diagnostic/i.test(s))h+=2;else if(/brake/i.test(s))h+=1.5;else if(/tyre/i.test(s))h+=1.5;else if(/other/i.test(s))h+=1;}return Math.max(.5,Math.min(8,h||1))}
async function query(url,key,path){const r=await fetch(`${url}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error(await r.text());return r.json()}
function nextSlot(rows,hours){const dur=Math.ceil(hours*60/30)*30;const blocks=(rows||[]).map(j=>[mins(j.drop_time),mins(j.drop_time)+Math.ceil(Number(j.estimated_hours||1)*60/30)*30]).sort((a,b)=>a[0]-b[0]);for(let s=DAY_START;s+dur<=DAY_END;s+=30){if(blocks.every(([a,b])=>s+dur<=a||s>=b))return s;}return null}
function clampDayBlock(start,end){const a=Math.max(DAY_START,mins(start||'08:00'));const b=Math.min(DAY_END,mins(end||'16:00'));return Math.max(0,b-a)}
function bookedMinutes(rows){return (rows||[]).reduce((sum,j)=>sum+Math.max(0,Math.ceil(Number(j.estimated_hours||1)*60/30)*30),0)}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Availability service is not configured'});
 try{
  const hours=Math.max(.5,Number(req.body?.estimated_hours)||durationFor(req.body?.job_types||[],req.body?.service_choice||''));
  const motBooking=hasMot(req.body?.job_types||[],req.body?.service_choice||'');
  const start=new Date(); start.setUTCDate(start.getUTCDate()+1); let dates=[];for(let i=0;i<50&&dates.length<28;i++){const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);if(weekday(d))dates.push(ymd(d));}
  if(motBooking)dates=dates.slice(MOT_LEAD_WEEKDAYS);
  dates=dates.slice(0,24);
  const rows=await query(url,key,`jobs?select=booking_date,drop_time,estimated_hours,technician,archived,status&booking_date=gte.${dates[0]}&booking_date=lte.${dates[dates.length-1]}&archived=eq.false&technician=eq.${encodeURIComponent(PUBLIC_BOOKING_TECHNICIAN)}`);
  let timeOff=[];try{timeOff=await query(url,key,`mechanic_time_off?select=mechanic,start_date,end_date,start_time,end_time&mechanic=eq.${encodeURIComponent(PUBLIC_BOOKING_TECHNICIAN)}&start_date=lte.${dates[dates.length-1]}&end_date=gte.${dates[0]}`)}catch{}
  const slots=[];
  for(const date of dates){
   const day=(rows||[]).filter(r=>r.booking_date===date&&r.technician===PUBLIC_BOOKING_TECHNICIAN&&String(r.status||'').toLowerCase()!=='completed');
   const off=(timeOff||[]).filter(o=>o.mechanic===PUBLIC_BOOKING_TECHNICIAN&&date>=o.start_date&&date<=o.end_date);
   const occupied=bookedMinutes(day)+off.reduce((sum,o)=>sum+clampDayBlock(o.start_time,o.end_time),0);
   const bookedRatio=occupied/DAY_MINUTES;
   if(bookedRatio>=MAX_BOOKED_RATIO)continue;
   const augmented=[...day,...off.map(o=>({drop_time:o.start_time||'08:00',estimated_hours:clampDayBlock(o.start_time,o.end_time)/60}))];
   const s=nextSlot(augmented,hours);
   if(s!==null)slots.push({date,time:hhmm(s),technician:PUBLIC_BOOKING_TECHNICIAN,hours,booked_percentage:Math.round(bookedRatio*100)});
   if(slots.length>=12)break;
  }
  return res.status(200).json({hours,technician:PUBLIC_BOOKING_TECHNICIAN,max_booked_percentage:75,mot_lead_weekdays:motBooking?MOT_LEAD_WEEKDAYS:0,slots});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to calculate workshop availability'});}
}
