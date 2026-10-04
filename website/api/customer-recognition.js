function cleanReg(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const registration=cleanReg(req.body?.registration);
  if(!registration)return res.status(400).json({error:'Registration is required'});
  try{
    const cfgRes=await fetch('https://vecta-planner.vercel.app/api/supabase-config',{headers:{'Cache-Control':'no-cache'}});
    if(!cfgRes.ok)throw new Error('Customer recognition is unavailable');
    const cfg=await cfgRes.json();
    const base=String(cfg.supabaseUrl||'').replace(/\/$/,'');
    const key=cfg.supabasePublishableKey;
    if(!base||!key)throw new Error('Customer recognition is unavailable');
    const r=await fetch(`${base}/rest/v1/vehicles?select=customer_id&registration=eq.${encodeURIComponent(registration)}&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`,'Cache-Control':'no-cache'}});
    if(!r.ok)throw new Error('Customer recognition is unavailable');
    const rows=await r.json();
    return res.status(200).json({recognised:!!rows?.[0]?.customer_id});
  }catch(e){
    console.error(e);
    return res.status(200).json({recognised:false});
  }
}
