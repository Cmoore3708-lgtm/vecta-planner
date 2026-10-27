// Separate website deployments forward pricing to the same authoritative engine.
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
  try {
    const response=await fetch('https://vecta-planner.vercel.app/api/service-price',{
      method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body||{}),signal:AbortSignal.timeout(12000)});
    return res.status(response.status).json(await response.json());
  } catch {return res.status(200).json({status:'UNAVAILABLE'});}
}
