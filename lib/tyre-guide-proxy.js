import {parseSize} from '../workers/tyres/guide.mjs';
import {selectCatalogueGuides} from '../workers/tyres/tiers.mjs';
export default async function tyreGuide(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
 let size,quantity;try{size=parseSize(req.body?.size).key;quantity=req.body?.quantity;if(!Number.isInteger(quantity)||quantity<1||quantity>4)throw Error();}catch{return res.status(400).json({status:'INVALID_INPUT'});}
 const endpoint=process.env.TYRE_WORKER_URL,token=process.env.TYRE_WORKER_TOKEN;
 if(!endpoint||!token||token.length<32)return res.status(200).json({status:'NOT_CONFIGURED'});
 try{
  const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();
  const upstream=await fetch(new URL('/quote',url),{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({size,quantity}),signal:AbortSignal.timeout(22000)});
  if(!upstream.ok)throw Error();const raw=await upstream.text();if(raw.length>250000)throw Error();const data=JSON.parse(raw);
  if(data.status!=='MATCHED'||!Array.isArray(data.catalogue)||data.catalogue.length>3000||data.size!==size)throw Error();
  const checked=Date.parse(data.checkedAt);if(!Number.isFinite(checked)||Date.now()-checked>300000||checked>Date.now()+60000)throw Error();
  const guide=selectCatalogueGuides(data.catalogue,{size,quantity,settings:data.settings,now:checked});
  return res.status(200).json({status:'MATCHED',...guide});
 }catch{return res.status(200).json({status:'UNAVAILABLE'});}
}
