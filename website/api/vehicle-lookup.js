export default async function handler(req,res){
  const reg=String(req.query?.reg||'').trim();
  if(!reg)return res.status(400).json({error:'Registration is required'});
  try{
    const r=await fetch('https://vecta-planner.vercel.app/api/vehicle-lookup?reg='+encodeURIComponent(reg));
    const text=await r.text();
    res.status(r.status); res.setHeader('Content-Type',r.headers.get('content-type')||'application/json'); return res.send(text);
  }catch(e){return res.status(502).json({error:'Vehicle lookup is temporarily unavailable'});}
}
