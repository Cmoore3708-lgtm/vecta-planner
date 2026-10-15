export default async function handler(req,res){
  if(req.query?.action==='release'){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    return res.status(200).json({application:'website',commit:/^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA||'')?process.env.VERCEL_GIT_COMMIT_SHA:null,environment:process.env.VERCEL_ENV||'development'});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const r=await fetch('https://vecta-planner.vercel.app/api/availability',{
      method:'POST',
      headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},
      body:JSON.stringify(req.body||{})
    });
    const text=await r.text();
    res.status(r.status);
    res.setHeader('Content-Type',r.headers.get('content-type')||'application/json');
    res.setHeader('Cache-Control','no-store');
    return res.send(text);
  }catch(e){
    console.error('Availability proxy failed',e);
    return res.status(502).json({error:'Workshop availability is temporarily unavailable'});
  }
}
