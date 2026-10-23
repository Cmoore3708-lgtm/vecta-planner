import {databaseEnvironment} from './_database-environment.js';
import {validManagerSession, managerGate} from '../middleware.js';
import {sameOriginRequest} from '../lib/workshop-access.js';

const normalise = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message,status=400) => Object.assign(new Error(message),{status});
async function database(path,options={}) {
  const {url,key}=databaseEnvironment({requireService:true});
  const response=await fetch(url+'/rest/v1/'+path,{
    ...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},
    signal:AbortSignal.timeout(12000),cache:'no-store'
  });
  if(!response.ok)throw fail('Message history is temporarily unavailable. Please retry.',503);
  return response.status===204?null:response.json();
}
export async function managerAuthorised(req) {
  const credentials={user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
  if(!credentials.user||!credentials.password)return false;
  // Use a protected path: /api itself is deliberately public in middleware.
  const request=new Request('https://'+(req.headers.host||'localhost')+'/message-centre',{headers:req.headers});
  return !!(await validManagerSession(request,credentials)) || !managerGate(request,credentials);
}
export function preparedRecord(body,now=Date.now()) {
  if(!body || !uuid.test(String(body.id||'')))throw fail('A valid message reference is required.');
  if(!['email','whatsapp','sms'].includes(body.method))throw fail('Choose a message method.');
  const limits={registration:12,job_id:36,invoice_id:80,kind:40,recipient:1000,subject:500,body:30000};
  const row={id:body.id,method:body.method};
  for(const [key,limit] of Object.entries(limits)) {
    if(typeof body[key]!=='undefined' && typeof body[key]!=='string')throw fail('Invalid message details.');
    row[key]=String(body[key]||'');
    if(row[key].length>limit)throw fail('Message details are too long.');
  }
  row.registration=normalise(row.registration);
  if(!row.body.trim()||!row.kind.trim()||!row.recipient.trim())throw fail('Message text, type and recipient are required.');
  if(row.job_id&&!uuid.test(row.job_id))throw fail('Invalid job reference.');
  const time=Date.parse(body.occurred_at);
  if(!Number.isFinite(time)||time>now+300000||time<Date.parse('2020-01-01T00:00:00Z'))throw fail('Invalid prepared time.');
  row.occurred_at=new Date(time).toISOString();
  return row; // status is never accepted from the browser: these are prepared records.
}
export function historyQuery(query={}) {
  const params=new URLSearchParams({select:'id,occurred_at,registration,method,kind,subject,status',order:'occurred_at.desc,id.desc',limit:'51'});
  if(query.id) {
    if(typeof query.id!=='string'||query.id.length>200||!/^(prepared|email|booking):[a-zA-Z0-9:-]+$/.test(query.id))throw fail('Invalid message reference.');
    return new URLSearchParams({select:'*',id:'eq.'+query.id,limit:'1'});
  }
  if(query.registration){
    if(typeof query.registration!=='string'||query.registration.length>20)throw fail('Invalid registration.');
    const registration=normalise(query.registration);
    if(!registration)throw fail('Enter a registration.');
    params.set('registration','like.*'+registration+'*');
  }
  if(query.cursor){
    let cursor;try{cursor=JSON.parse(Buffer.from(String(query.cursor),'base64url').toString());}catch{throw fail('Invalid page reference.');}
    if(!cursor||typeof cursor.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.time)||!Number.isFinite(Date.parse(cursor.time))||!/^(prepared|email|booking):[a-zA-Z0-9:-]+$/.test(cursor.id||'')||cursor.id.length>200)throw fail('Invalid page reference.');
    // Preserve Postgres microseconds: rounding to JS milliseconds skips rows.
    const time=cursor.time;
    params.set('or',`(occurred_at.lt.${time},and(occurred_at.eq.${time},id.lt.${cursor.id}))`);
  }
  return params;
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  if(!await managerAuthorised(req))return res.status(401).json({error:'Manager sign-in required.'});
  try {
    if(req.method==='POST') {
      if(!sameOriginRequest(req)||!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(403).json({error:'Use Workshop Pro to record messages.'});
      const row=preparedRecord(req.body);
      // Preserve the preparation snapshot even if a job has since been corrected
      // or removed while this record waited offline. Only managers can write here.
      await database('workshop_messages?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(row)});
      return res.status(200).json({recorded:true,id:row.id});
    }
    const rows=await database('workshop_message_history?'+historyQuery(req.query));
    if(req.query?.id){if(!rows?.[0])return res.status(404).json({error:'Message not found.'});return res.status(200).json({message:rows[0]});}
    const messages=rows.slice(0,50),last=messages.at(-1);
    return res.status(200).json({messages,next_cursor:rows.length>50?Buffer.from(JSON.stringify({time:last.occurred_at,id:last.id})).toString('base64url'):null});
  }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Message history is temporarily unavailable. Please retry.'});}
}
