import {uuid} from './job-progress.js';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const normal=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const email=value=>String(value||'').trim().toLowerCase();
// Ordering receipts are separate from message reads, forwarding and the older
// parts traffic lights. Rescheduling the same customer's job keeps the reminder.
export async function pendingQuoteParts(db,after){
 if(after!==undefined&&!uuid.test(after||''))throw fail('Invalid parts reminder page.');
 const params={select:'id,job_id,registration,customer_email,jobs!inner(id,registration,customer_email,status,archived)',status:'eq.approved',progress_review_state:'eq.sent',progress_parts_required:'eq.true',progress_parts_ordered_at:'is.null','jobs.archived':'eq.false','jobs.status':'not.in.(completed,cancelled,deleted,invoiced,invoice_created,ready_to_invoice)',order:'id.asc',limit:250};
 if(after)params.id='gt.'+after;
 const rows=await db('additional_work_approvals?'+new URLSearchParams(params));
 return {reminders:rows.filter(row=>row.jobs&&normal(row.registration)===normal(row.jobs.registration)&&email(row.customer_email)===email(row.jobs.customer_email)).map(row=>({approval_id:row.id,job_id:row.job_id})),next_cursor:rows.length===250?rows.at(-1).id:null};
}
export async function recordQuotePartsOrder(db,body){
 const ids=body.approval_ids;
 if(!uuid.test(body.job_id||'')||!uuid.test(body.order_id||'')||!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!uuid.test(id||''))||new Set(ids).size!==ids.length||typeof body.undo!=='boolean')throw fail('Choose the parts reminder again.');
 const result=await db('rpc/vecta_record_quote_parts_order',{method:'POST',body:JSON.stringify({p_job_id:body.job_id,p_approval_ids:ids,p_order_id:body.order_id,p_undo:body.undo})});
 if(result.code!==200)throw fail(result.error,result.code);
 return {ok:true,confirmed_ids:result.confirmed_ids,undo_ids:result.undo_ids};
}
