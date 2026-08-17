function cfg(){return {url:process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}}
function cleanReg(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function normPhone(v){return String(v||'').replace(/\D/g,'').replace(/^44/,'0')}
async function sb(url,key,path){const r=await fetch(`${url}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error(await r.text());return r.json()}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const {url,key}=cfg(); if(!url||!key)return res.status(500).json({error:'Customer lookup is not configured'});
 try{
  const registration=cleanReg(req.body?.registration), contact=String(req.body?.contact||'').trim();
  if(!registration||!contact)return res.status(400).json({error:'Registration and email or mobile number are required'});
  const vehicles=await sb(url,key,`vehicles?select=registration,customer_id,vehicle,notes&registration=eq.${encodeURIComponent(registration)}`);
  const vehicle=vehicles?.[0]; if(!vehicle?.customer_id)return res.status(404).json({found:false});
  const customers=await sb(url,key,`customers?select=id,name,phone,email&id=eq.${encodeURIComponent(vehicle.customer_id)}`);
  const customer=customers?.[0]; if(!customer)return res.status(404).json({found:false});
  const emailMatch=contact.includes('@')&&String(customer.email||'').trim().toLowerCase()===contact.toLowerCase();
  const phoneMatch=!contact.includes('@')&&normPhone(customer.phone)===normPhone(contact);
  if(!emailMatch&&!phoneMatch)return res.status(404).json({found:false});
  const owned=await sb(url,key,`vehicles?select=registration,vehicle,notes&customer_id=eq.${encodeURIComponent(customer.id)}&order=registration.asc`);
  const jobs=await sb(url,key,`jobs?select=id,booking_date,registration,vehicle,job_type,work_required,status,mot_due&registration=eq.${encodeURIComponent(registration)}&order=booking_date.desc&limit=20`);
  const serviceJobs=(jobs||[]).filter(j=>/service|oil/i.test(`${j.job_type||''} ${j.work_required||''}`));
  return res.status(200).json({found:true,customer:{name:customer.name||'',phone:customer.phone||'',email:customer.email||''},vehicles:owned||[],recentJobs:jobs||[],latestServiceDate:serviceJobs[0]?.booking_date||null});
 }catch(e){console.error(e);return res.status(500).json({error:'Unable to retrieve customer history'});}
}
