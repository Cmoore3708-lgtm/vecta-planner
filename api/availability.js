import haynesVehicle from '../lib/haynes-proxy.js';
import haynesImage from '../lib/haynes-image.js';
import { databaseEnvironment } from './_database-environment.js';
function cfg(){return databaseEnvironment()}
const DAY_START=8*60,DAY_END=16*60,DAY_MINUTES=DAY_END-DAY_START;
const PUBLIC_BOOKING_TECHNICIAN='Alfie';
const MAX_BOOKED_RATIO=.75;
const FRIDAY_MAX_BOOKED_RATIO=.5;
const MOT_LEAD_DAYS=9;
function mins(t){const [h,m]=String(t||'08:00').slice(0,5).split(':').map(Number);return h*60+(m||0)}
function hhmm(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function ymd(d){return d.toISOString().slice(0,10)}
function weekday(d){const n=d.getUTCDay();return n!==0&&n!==1&&n!==6}
function hasMot(types=[],service=''){return [...(Array.isArray(types)?types:[]),service].some(x=>/^mot$/i.test(String(x||'').trim()))}
export function durationFor(types=[],service=''){let h=0;const all=[...types]; if(service&&!all.includes(service))all.push(service);for(const t of all){const s=String(t);if(/major service/i.test(s))h+=2.5;else if(/full service/i.test(s))h+=1.5;else if(/interim service|oil.*filter|^service$/i.test(s))h+=1;else if(/^mot$/i.test(s))h+=1;else if(/diagnostic/i.test(s))h+=2;else if(/brake/i.test(s))h+=1.5;else if(/tyre/i.test(s))h+=1.5;else if(/other/i.test(s))h+=1;}return Math.max(.5,Math.min(8,h||1))}
async function query(url,key,path){const r=await fetch(`${url}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error(await r.text());return r.json()}
function nextSlot(rows,hours){const dur=Math.ceil(hours*60/30)*30;const blocks=(rows||[]).map(j=>[mins(j.drop_time),mins(j.drop_time)+Math.ceil(Number(j.estimated_hours||1)*60/30)*30]).sort((a,b)=>a[0]-b[0]);for(let s=DAY_START;s+dur<=DAY_END;s+=30){if(blocks.every(([a,b])=>s+dur<=a||s>=b))return s;}return null}
function clampDayBlock(start,end){const a=Math.max(DAY_START,mins(start||'08:00'));const b=Math.min(DAY_END,mins(end||'16:00'));return Math.max(0,b-a)}
function bookedMinutes(rows){return (rows||[]).reduce((sum,j)=>sum+Math.max(0,Math.ceil(Number(j.estimated_hours||1)*60/30)*30),0)}
export function bookingSlot(date,rows=[],timeOff=[],pending=[],hours=1){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 if([0,1,6].includes(weekday))return null;
 const friday=weekday===5;
 const day=rows.filter(r=>r.booking_date===date&&r.technician===PUBLIC_BOOKING_TECHNICIAN&&!['completed','cancelled','deleted','quote'].includes(String(r.status||'').toLowerCase())&&!r.archived);
 const off=timeOff.filter(o=>o.mechanic===PUBLIC_BOOKING_TECHNICIAN&&date>=o.start_date&&date<=o.end_date).map(o=>({...o,start_time:date===o.start_date?o.start_time:'08:00',end_time:date===o.end_date?o.end_time:'16:00'}));
 if(friday)off.push({start_time:'14:30',end_time:'16:00'});
 const reserved=friday?pending.filter(r=>r.confirmed_date===date).reduce((sum,r)=>sum+durationFor(r.job_types||[])*60,0):0;
 const booked=bookedMinutes(day)+reserved;
 const occupied=booked+off.reduce((sum,o)=>sum+clampDayBlock(o.start_time,o.end_time),0);
 const duration=Math.ceil(hours*2)/2*60;
 if(friday?booked+duration>DAY_MINUTES*FRIDAY_MAX_BOOKED_RATIO:occupied/DAY_MINUTES>=MAX_BOOKED_RATIO)return null;
 const augmented=[...day,...off.map(o=>({drop_time:o.start_time||'08:00',estimated_hours:clampDayBlock(o.start_time,o.end_time)/60}))];
 const start=nextSlot(augmented,hours);
 return start===null?null:{date,time:hhmm(start),technician:PUBLIC_BOOKING_TECHNICIAN,hours,booked_percentage:Math.round(booked/DAY_MINUTES*100),max_booked_percentage:friday?50:75};
}
export default async function handler(req,res){
 if(req.query?.haynesImage==='1')return haynesImage(req,res);
 if(req.query?.haynes==='1')return haynesVehicle(req,res);
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Availability service is not configured'});
 try{
  const hours=Math.max(.5,Number(req.body?.estimated_hours)||durationFor(req.body?.job_types||[],req.body?.service_choice||''));
  const motBooking=hasMot(req.body?.job_types||[],req.body?.service_choice||'');
  const start=new Date(); start.setUTCDate(start.getUTCDate()+1); let dates=[];for(let i=0;i<180;i++){const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);if(weekday(d))dates.push(ymd(d));}
  if(motBooking){const cutoff=new Date();cutoff.setUTCHours(0,0,0,0);cutoff.setUTCDate(cutoff.getUTCDate()+MOT_LEAD_DAYS);dates=dates.filter(date=>date>=ymd(cutoff));}
  const rows=await query(url,key,`jobs?select=booking_date,drop_time,estimated_hours,technician,archived,status&booking_date=gte.${dates[0]}&booking_date=lte.${dates[dates.length-1]}&archived=eq.false&technician=eq.${encodeURIComponent(PUBLIC_BOOKING_TECHNICIAN)}`);
  const settings=await query(url,key,'workshop_settings?select=time_off:value->mechanicTimeOff&id=eq.main');
  const timeOff=Array.isArray(settings?.[0]?.time_off)?settings[0].time_off:[];
  const pending=await query(url,key,`website_booking_requests?select=id,confirmed_date,job_types&status=eq.awaiting_review&confirmed_date=gte.${dates[0]}&confirmed_date=lte.${dates[dates.length-1]}`);
  const slots=dates.map(date=>bookingSlot(date,rows,timeOff,pending,hours)).filter(Boolean);
  return res.status(200).json({hours,technician:PUBLIC_BOOKING_TECHNICIAN,max_booked_percentage:75,friday_max_booked_percentage:50,closed_weekdays:[0,1,6],mot_lead_days:motBooking?MOT_LEAD_DAYS:0,slots});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to calculate workshop availability'});}
}
