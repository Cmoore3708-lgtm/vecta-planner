import {normaliseReg,validReg} from './haynes-vehicle.js';
import '../public/js/vecta-service-pricing.js';
const {matchesIdentity}=globalThis.VectaServicePricing;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['preview','production'].includes(process.env.VERCEL_ENV))return res.status(404).json({status:'DISABLED'});
  if(req.method!=='GET')return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
  const registration=typeof req.query.reg==='string'?normaliseReg(req.query.reg):'';
  const typeId=req.query.typeId,engineCode=req.query.engineCode||'';
  if(!validReg(registration)||typeof typeId!=='string'||!/^t_\d+$/.test(typeId)||typeof engineCode!=='string'||engineCode.length>180)return res.status(400).json({status:'INVALID_REQUEST'});
  const token=process.env.HAYNES_RELAY_SITE_TOKEN;
  if(!/^[a-f0-9]{64}$/.test(token||''))return res.status(200).json({status:'UNAVAILABLE'});
  try{
    const response=await fetch('https://brqsejjykrubxuofavuu.supabase.co/functions/v1/haynes-pricing-cache',{
      method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({registration,typeId,engineCode}),signal:AbortSignal.timeout(2500)});
    const data=await response.json();
    if(response.ok&&data.status==='MATCHED'&&matchesIdentity(data,{registration,typeId,engineCode})&&typeof data.oilLitres==='number'&&data.oilLitres>=1&&data.oilLitres<=15)
      return res.status(200).json({status:'MATCHED',registration,typeId,engineCode,oilLitres:data.oilLitres,source:'HaynesPro'});
  }catch{}
  return res.status(200).json({status:'UNAVAILABLE'});
}
