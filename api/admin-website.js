import crypto from 'node:crypto';
import { databaseEnvironment } from './_database-environment.js';

function safeEqual(a,b){const A=Buffer.from(String(a||'')),B=Buffer.from(String(b||''));return A.length===B.length&&crypto.timingSafeEqual(A,B)}
function authorised(req){
  const h=String(req.headers.authorization||'');
  if(!h.startsWith('Basic ')) return false;
  try{const [u,...rest]=Buffer.from(h.slice(6),'base64').toString('utf8').split(':');return safeEqual(u,process.env.VECTA_MAIN_USER)&&safeEqual(rest.join(':'),process.env.VECTA_MAIN_PASSWORD)}catch{return false}
}
async function sb(path, options={}){
  const {url,key}=databaseEnvironment({requireService:true});
  const r=await fetch(url+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
  const body=await r.text(); if(!r.ok) throw new Error('Database '+r.status+': '+body.slice(0,300)); return body?JSON.parse(body):null;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET' && String(req.query?.public||'')==='1') {
    try {
      const rows=await sb('website_content?id=eq.main&select=published,published_version,published_at');
      const row=rows?.[0]||{};
      res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
      return res.status(200).json({content:row.published||{},version:row.published_version||0,publishedAt:row.published_at||null});
    } catch(e) { return res.status(503).json({error:String(e?.message||e)}); }
  }
  const preview = process.env.VERCEL_ENV === 'preview';
  // Preview deployments are already protected by Vercel Authentication.
  // Production still requires the separate VECTA manager credentials.
  if(!preview && !authorised(req)) {res.setHeader('WWW-Authenticate','Basic realm="VECTA Admin"');return res.status(401).json({error:'Manager sign-in required'});}
  try{
    if(req.method==='GET'){
      const rows=await sb('website_content?id=eq.main&select=*');
      const history=await sb('website_content_history?website_id=eq.main&select=id,version,created_at&order=version.desc&limit=20');
      return res.status(200).json({record:rows?.[0]||null,history:history||[]});
    }
    if(req.method==='PUT'){
      const draft=req.body?.draft;
      if(!draft||typeof draft!=='object'||Array.isArray(draft)) return res.status(400).json({error:'draft must be an object'});
      const rows=await sb('website_content?id=eq.main',{method:'PATCH',body:JSON.stringify({draft,updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,record:rows?.[0]||null});
    }
    if(req.method==='POST'&&req.body?.action==='rollback'){
      const version=Number(req.body?.version);
      if(!Number.isInteger(version)||version<1) return res.status(400).json({error:'Valid version required'});
      const old=await sb('website_content_history?website_id=eq.main&version=eq.'+version+'&select=content&limit=1');
      if(!old?.[0]) return res.status(404).json({error:'Version not found'});
      const rows=await sb('website_content?id=eq.main',{method:'PATCH',body:JSON.stringify({draft:old[0].content,updated_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,record:rows?.[0]||null,restoredVersion:version});
    }
    if(req.method==='POST'&&req.body?.action==='publish'){
      const rows=await sb('website_content?id=eq.main&select=*');
      const current=rows?.[0]; if(!current) return res.status(404).json({error:'Website content record missing'});
      const version=Number(current.published_version||0)+1;
      if(current.published_version>0) await sb('website_content_history',{method:'POST',body:JSON.stringify({website_id:'main',version:current.published_version,content:current.published||{}})});
      const now=new Date().toISOString();
      const updated=await sb('website_content?id=eq.main',{method:'PATCH',body:JSON.stringify({published:current.draft||{},published_version:version,published_at:now,updated_at:now})});
      return res.status(200).json({ok:true,record:updated?.[0]||null});
    }
    res.setHeader('Allow','GET, PUT, POST'); return res.status(405).json({error:'Method not allowed'});
  }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
