export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const body=req.body||{};
    const jobTypes=Array.isArray(body.job_types)?body.job_types.map(x=>String(x||'')):[];
    const isMot=jobTypes.some(x=>/(^|\b)mot(\b|$)/i.test(x.trim()));
    if(!isMot&&body.appointment_date){
      const appointment=new Date(String(body.appointment_date).slice(0,10)+'T08:00:00Z');
      if(!Number.isFinite(appointment.getTime())||appointment.getTime()<Date.now()+(48*60*60*1000)){
        return res.status(400).json({error:'Online appointments must be booked at least 48 hours in advance'});
      }
    }
    const r=await fetch('https://vecta-planner.vercel.app/api/website-booking',{
      method:'POST',
      headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},
      body:JSON.stringify(body)
    });
    const text=await r.text();
    res.status(r.status);
    res.setHeader('Content-Type',r.headers.get('content-type')||'application/json');
    res.setHeader('Cache-Control','no-store');
    return res.send(text);
  }catch(e){
    console.error('Website booking proxy failed',e);
    return res.status(502).json({error:'Workshop booking service is temporarily unavailable'});
  }
}
