import { mechanicAuthorised, mechanicCookie } from './mechanic-auth.js';
import { databaseEnvironment } from '../api/_database-environment.js';

export const MECHANIC_FIELDS=['id','booking_date','registration','vehicle','technician','drop_time','status','job_type','work_required','technician_notes','estimated_hours','updated_at'];
const ACTIVE=['booked','arrived','in_progress'];
const projectJob=row=>Object.fromEntries(MECHANIC_FIELDS.map(k=>[k,row[k]??null]));
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
export function createMechanicHandler({request=fetch,environment=databaseEnvironment}={}) {
  return async function(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','PATCH'].includes(req.method)){res.setHeader('Allow','GET, PATCH');return res.status(405).json({error:'Method not allowed.'});}
    const headers=req.headers||{};
    const authRequest=new Request('https://mechanic.invalid/',{headers:{authorization:headers.authorization||'',cookie:headers.cookie||''}});
    if(!await mechanicAuthorised(authRequest)) {
      res.setHeader('WWW-Authenticate','Basic realm="VECTA Mechanics", charset="UTF-8"');
      return res.status(401).json({error:'Mechanics sign-in required.'});
    }
    // This endpoint never returns a database token or accepts a table name/query.
    if(req.method==='PATCH') {
      let originOK=false;
      try { originOK=new URL(headers.origin).host===headers.host; } catch { /* Require a browser origin for writes. */ }
      if(!originOK||headers['sec-fetch-site']==='cross-site'||headers['x-vecta-mechanic']!=='1')return res.status(403).json({error:'Use the mechanics application to save work.'});
    }
    try {
      const env=environment({requireService:true});
      const url=new URL(env.url+'/rest/v1/jobs');
      url.searchParams.set('select',MECHANIC_FIELDS.join(','));
      url.searchParams.set('archived','not.is.true');
      url.searchParams.set('completed_at','is.null');
      url.searchParams.set('status','in.('+ACTIVE.join(',')+')');
      const init={method:req.method,headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey},signal:AbortSignal.timeout(15000),cache:'no-store'};
      if(req.method==='GET') {
        const date=req.query?.date;
        if(typeof date!=='string'||!validDate(date))return res.status(400).json({error:'Choose a valid date.'});
        if(Object.keys(req.query||{}).some(k=>k!=='date'))return res.status(400).json({error:'Unsupported query.'});
        url.searchParams.set('booking_date','eq.'+date);
        url.searchParams.set('order','drop_time.asc.nullslast,id.asc');
        url.searchParams.set('limit','1000');
      } else {
        const body=req.body;
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['id','updated_at','technician_notes','status'].includes(k)))return res.status(400).json({error:'Unsupported job change.'});
        if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.id||'')||typeof body.updated_at!=='string'||!Number.isFinite(Date.parse(body.updated_at)))return res.status(400).json({error:'Reload the job before saving.'});
        const patch={};
        if(Object.hasOwn(body,'technician_notes')) {
          if(typeof body.technician_notes!=='string'||body.technician_notes.length>10000)return res.status(400).json({error:'Notes must be no longer than 10,000 characters.'});
          patch.technician_notes=body.technician_notes;
        }
        // Completion stays with Main: it performs service, invoice and notification updates.
        if(Object.hasOwn(body,'status')) {
          if(body.status!=='in_progress')return res.status(400).json({error:'Completion must be recorded in Main.'});
          patch.status='in_progress';
        }
        if(!Object.keys(patch).length)return res.status(400).json({error:'No changes supplied.'});
        patch.updated_at=new Date().toISOString();
        url.searchParams.set('id','eq.'+body.id);
        url.searchParams.set('updated_at','eq.'+body.updated_at);
        init.headers['Content-Type']='application/json';
        init.headers.Prefer='return=representation';
        init.body=JSON.stringify(patch);
      }
      const result=await request(url,init);
      if(!result.ok)throw Error('Database unavailable');
      const rows=await result.json();
      if(!Array.isArray(rows))throw Error('Invalid database response');
      if(req.method==='PATCH'&&rows.length!==1)return res.status(409).json({error:'This job changed or is no longer active. Reload before saving.'});
      res.setHeader('Set-Cookie',await mechanicCookie());
      return res.status(200).json({jobs:rows.map(projectJob)});
    } catch {return res.status(503).json({error:'Unable to connect. Keep this page open to preserve unsaved notes and try again.'});}
  };
}
