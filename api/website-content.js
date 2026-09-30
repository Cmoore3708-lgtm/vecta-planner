import { databaseEnvironment } from './_database-environment.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  try{
    const {url,key}=databaseEnvironment({requireService:true});
    const r=await fetch(url+'/rest/v1/website_content?id=eq.main&select=published,published_version,published_at',{headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'}});
    if(!r.ok) throw new Error('Content unavailable');
    const rows=await r.json(); const row=rows?.[0]||{};
    return res.status(200).json({content:row.published||{},version:row.published_version||0,publishedAt:row.published_at||null});
  }catch(e){return res.status(503).json({error:String(e?.message||e)})}
}
