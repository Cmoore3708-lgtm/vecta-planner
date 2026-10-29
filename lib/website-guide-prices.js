import { managerGate, validManagerSession } from '../middleware.js';
import { databaseEnvironment } from '../api/_database-environment.js';
import '../public/js/vecta-guide-prices.js';
const {defaults,validate}=globalThis.VectaGuidePrices;
const recordId='service_guide_prices';
async function database(path,options={}){
 const {url,key}=databaseEnvironment({requireService:true});
 const response=await fetch(url+'/rest/v1/'+path,{...options,cache:'no-store',signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation',...options.headers}});
 if(!response.ok){const error=Error('Website price storage is unavailable.');error.conflict=response.status===409;throw error;}
 return response.json();
}
export async function guidePricesHandler(req,res){
 res.setHeader('Cache-Control','no-store');
 const publicRead=req.method==='GET'&&req.query?.public==='1';
 if(!publicRead){
  const headers=req.headers||{},credentials={user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
  const request=new Request('https://'+(headers.host||'vecta-planner.vercel.app')+'/website-settings.html',{headers:{authorization:String(headers.authorization||''),cookie:String(headers.cookie||'')}});
  if(!await validManagerSession(request,credentials)&&managerGate(request,credentials)){
   res.setHeader('WWW-Authenticate','Basic realm="VECTA Main", charset="UTF-8"');
   return res.status(401).json({error:'Manager sign-in required.'});
  }
  if(req.method!=='GET'){
   if(headers['x-vecta-website-settings']!=='1'||headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Use Website Settings to save prices.'});
   if(headers.origin){try{if(new URL(headers.origin).host!==headers.host)return res.status(403).json({error:'Use Website Settings to save prices.'});}catch{return res.status(403).json({error:'Invalid origin.'});}}
  }
 }
 if(!['GET','PUT'].includes(req.method)){res.setHeader('Allow','GET, PUT');return res.status(405).json({error:'Method not allowed'});}
 let prices;
 if(req.method==='PUT'){
  try{prices=validate(req.body?.prices);}catch(error){return res.status(400).json({error:error.message});}
  if(!Number.isSafeInteger(req.body?.version)||req.body.version<0)return res.status(400).json({error:'Reload the saved prices before editing.'});
 }
 try{
  const rows=await database('website_content?id=eq.'+recordId+'&select=published,published_version,published_at'),current=rows[0];
  if(req.method==='GET')return res.status(200).json({prices:current?validate(current.published.prices):defaults(),version:current?.published_version||0,savedAt:current?.published_at||null});
  const version=current?.published_version||0;
  if(req.body.version!==version)return res.status(409).json({error:'These prices changed in another window. Reload before saving.'});
  const now=new Date().toISOString(),body={published:{prices},draft:{prices},published_version:version+1,published_at:now,updated_at:now};
  const updated=current?await database('website_content?id=eq.'+recordId+'&published_version=eq.'+version,{method:'PATCH',body:JSON.stringify(body)}):await database('website_content',{method:'POST',body:JSON.stringify({id:recordId,...body})});
  if(updated.length!==1)return res.status(409).json({error:'Prices were not saved. Reload before trying again.'});
  return res.status(200).json({prices:validate(updated[0].published.prices),version:updated[0].published_version,savedAt:updated[0].published_at});
 }catch(error){return res.status(error.conflict?409:503).json({error:error.conflict?'These prices changed in another window. Reload before saving.':'Website prices could not be loaded or saved. Your edits have been kept; please try again.'});}
}
