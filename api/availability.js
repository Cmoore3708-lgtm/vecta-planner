import tyreGuide from '../lib/tyre-guide-proxy.js';
import haynesService from '../lib/haynes-service-proxy.js';
import haynesVehicle from '../lib/haynes-proxy.js';
import haynesImage from '../lib/haynes-image.js';
import { databaseEnvironment } from './_database-environment.js';
import {bookingTypes} from '../lib/booking-input.js';
function cfg(){return databaseEnvironment({requireService:true})}
export default async function handler(req,res){
 if(req.query?.tyres==='1')return tyreGuide(req,res);
 if(req.query?.haynesImage==='1')return haynesImage(req,res);
 if(req.query?.haynes==='service')return haynesService(req,res);
 if(req.query?.haynes==='1')return haynesVehicle(req,res);
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const {url,key}=cfg();if(!url||!key)return res.status(500).json({error:'Availability service is not configured'});
 try{
  const types=bookingTypes(req.body||{});
  const response=await fetch(`${url}/rest/v1/rpc/vecta_online_booking_availability`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_types:types})});
  if(!response.ok)throw new Error('Availability query failed');
  const data=await response.json();res.setHeader('Cache-Control','no-store');
  return res.status(200).json(data);
 }catch(e){if(e.code==='BOOKING_INPUT')return res.status(400).json({error:e.message});console.error(e);return res.status(500).json({error:'Unable to calculate workshop availability'});}
}
