export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','no-store');
  if(Array.isArray(req.query?.reg))return res.status(400).json({error:'Enter one registration'});
  const reg=String(req.query?.reg||'').trim();
  if(!reg)return res.status(400).json({error:'Registration is required'});
  try{
    const r=await fetch('https://vecta-planner.vercel.app/api/vehicle-lookup?reg='+encodeURIComponent(reg),{signal:AbortSignal.timeout(14000),cache:'no-store'});
    const text=await r.text();
    res.status(r.status); res.setHeader('Content-Type',r.headers.get('content-type')||'application/json'); return res.send(text);
  }catch(e){return res.status(502).json({error:'Vehicle lookup is temporarily unavailable'});}
}
