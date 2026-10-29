// Public website requests read only the guide-price table from Workshop Pro.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(process.env.VERCEL_ENV==='preview')return res.status(503).json({error:'Preview uses the built-in guide prices; production settings are isolated.'});
 try{
  const response=await fetch('https://vecta-planner.vercel.app/api/admin-website?guidePrices=1&public=1',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  return res.status(response.status).json(await response.json());
 }catch{return res.status(503).json({error:'Guide prices temporarily unavailable'});}
}
