import {bookingPhotos} from '../lib/booking-photos.js';
import {validManagerSession, managerGate} from '../middleware.js';
import {mechanicAuthorised, isMechanicHost} from '../lib/mechanic-auth.js';

export {bookingPhotos};
export async function readBookingPhotos(req,res,{url,key}) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const host=req.headers.host||'localhost';
  const request=new Request('https://'+host+'/work-photos',{headers:req.headers});
  const credentials={user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
  const authorised=isMechanicHost(host)
    ? await mechanicAuthorised(request)
    : !!(credentials.user&&credentials.password&&(await validManagerSession(request,credentials)||!managerGate(request,credentials)));
  if(!authorised)return res.status(401).json({error:'Workshop sign-in required.'});
  const id=req.query?.photos;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid booking reference.'});
  try{
    const r=await fetch(url+'/rest/v1/website_booking_photos?request_id=eq.'+id+'&select=photos&limit=1',{headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error('Photo lookup failed');
    const rows=await r.json();return res.status(200).json({photos:bookingPhotos(rows[0]?.photos)});
  }catch{return res.status(503).json({error:'Photos are temporarily unavailable. Please try again.'});}
}
