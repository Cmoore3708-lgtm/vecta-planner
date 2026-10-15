import { databaseEnvironment } from './_database-environment.js';
function cfg(){return databaseEnvironment({requireService:true})}
function cleanReg(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function normPhone(v){return String(v||'').replace(/\D/g,'').replace(/^44/,'0')}
async function sb(url,key,path){const r=await fetch(`${url}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error(await r.text());return r.json()}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const {url,key}=cfg(); if(!url||!key)return res.status(500).json({error:'Customer lookup is not configured'});
 try{
  const registration=cleanReg(req.body?.registration), contact=String(req.body?.contact||'').trim();
  if(!registration||registration.length>10||contact.length>254||(!contact.includes('@')&&normPhone(contact).length<7)||!contact)return res.status(400).json({error:'Registration and email or mobile number are required'});
  const vehicles=await sb(url,key,`vehicles?select=registration,customer_id,vehicle&registration=eq.${encodeURIComponent(registration)}`);
  const vehicle=vehicles?.[0]; if(!vehicle?.customer_id)return res.status(404).json({found:false});
  const customers=await sb(url,key,`customers?select=id,name,phone,email&id=eq.${encodeURIComponent(vehicle.customer_id)}`);
  const customer=customers?.[0]; if(!customer)return res.status(404).json({found:false});
  const emailMatch=contact.includes('@')&&String(customer.email||'').trim().toLowerCase()===contact.toLowerCase();
  const phoneMatch=!contact.includes('@')&&normPhone(customer.phone)===normPhone(contact);
  if(!emailMatch&&!phoneMatch)return res.status(404).json({found:false});
  res.setHeader('Cache-Control','no-store');
  // Returning-customer autofill needs contact details for this vehicle only.
  // Possession of a registration/contact pair does not authorise job history.
  return res.status(200).json({found:true,customer:{name:customer.name||'',phone:customer.phone||'',email:customer.email||''},vehicles:[{registration:vehicle.registration,vehicle:vehicle.vehicle||''}]});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to retrieve customer history'});}
}
