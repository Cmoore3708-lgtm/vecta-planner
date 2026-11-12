import {uuid} from './job-progress.js';

const fail=(message,status=400)=>Object.assign(Error(message),{status});

// Receipts are monotonic and scoped to the authenticated role. Never change a
// job, booking status, forwarding flag or message body when acknowledging it.
export async function markPortalRead(db,role,ids){
 if(!['manager','mechanic'].includes(role))throw fail('Workshop sign-in required.',403);
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!uuid.test(id)))throw fail('Choose valid messages.');
 const field=role+'_read_at',params={id:'in.('+[...new Set(ids)].join(',')+')',select:'id,'+field};
 if(role==='mechanic')params.mechanic_at='not.is.null';else params.actor='eq.customer';
 await db('customer_portal_events?'+new URLSearchParams({...params,[field]:'is.null'}),{method:'PATCH',body:JSON.stringify({[field]:new Date().toISOString()})});
 const rows=await db('customer_portal_events?'+new URLSearchParams(params));
 return {read_ids:rows.filter(row=>row[field]).map(row=>row.id)};
}

export async function markBookingRead(db,role,body){
 if(role!=='manager')throw fail('Use Workshop Pro to review website bookings.',403);
 const key=body.request_id?'id':'job_id',id=body.request_id||body.job_id;
 if(typeof id!=='string'||!uuid.test(id))throw fail('Choose a website booking.');
 const params={[key]:'eq.'+id,select:'id,reviewed_at'};
 await db('website_booking_requests?'+new URLSearchParams({...params,reviewed_at:'is.null'}),{method:'PATCH',body:JSON.stringify({reviewed_at:new Date().toISOString()})});
 return {requests:await db('website_booking_requests?'+new URLSearchParams(params))};
}
