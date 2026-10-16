(function(root){
 'use strict';
 const fields=['id','job_id','registration','amount','invoice_date','status','customer_name','customer_phone','vehicle','lines','subtotal','vat','total','customer_address','eom_month','fleet_customer','fleet_job_ids','fleet_month','mileage','mot_due','payment_method','source'];
 function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
 }
 async function create(client,invoice,prefix,{timeoutMs=12000}={}){
  if(!client||!invoice?.id)throw Error('Keep the invoice open until its cloud save is confirmed.');
  const payload={};for(const key of fields)if(invoice[key]!==undefined)payload[key]=invoice[key];
  payload.job_id=String(payload.job_id||'').trim()||null;
  // Staff invoices do not carry fleet jobs. Never send NULL to the NOT NULL JSONB column.
  if(!Array.isArray(payload.fleet_job_ids))payload.fleet_job_ids=[];
  payload.mot_due=String(payload.mot_due||'').trim()||null;
  payload.status=payload.status||'saved';
  for(const key of ['amount','subtotal','vat','total'])if(payload[key]!=null){
   if(String(payload[key]).trim()===''||!Number.isFinite(Number(payload[key])))throw Error('Valid invoice totals are required.');
   payload[key]=Number(payload[key]);
  }
  if(!['subtotal','vat','total'].every(k=>Number.isFinite(payload[k]))||!Array.isArray(payload.lines))throw Error('Valid invoice lines and totals are required.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.invoice_date||'')))throw Error('Invoice date is required.');
  const controller=new AbortController();let timer;
  try{
   const request=client.rpc('vecta_create_invoice',{p_invoice:JSON.parse(JSON.stringify(payload)),p_prefix:prefix||'VECTA'}).abortSignal(controller.signal);
   const result=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('The invoice save could not be confirmed. Keep this invoice open and retry; do not create a replacement.'));},timeoutMs);})]);
   if(result.error)throw result.error;
   const saved=result.data?.invoice;
   if(!saved||String(saved.id)!==String(payload.id)||!String(saved.invoice_number||'').trim()||String(saved.job_id||'')!==String(payload.job_id||'')||
      ['subtotal','vat','total'].some(k=>saved[k]==null||!Number.isFinite(Number(saved[k]))||Math.abs(Number(saved[k])-payload[k])>=0.005)||canonical(saved.lines)!==canonical(payload.lines)){
    throw Error('The cloud invoice receipt did not match this invoice. Keep it open and check the saved record before retrying.');
   }
   return saved;
  }catch(error){
   if(controller.signal.aborted)throw Error('The invoice save could not be confirmed. Keep this invoice open and retry; do not create a replacement.');
   throw error;
  }finally{clearTimeout(timer);controller.abort();}
 }
 async function edit(client,invoice,{timeoutMs=12000}={}){
  if(!invoice?.id||!invoice.updated_at)throw Error('Reopen this invoice from a refreshed invoice list before saving changes.');
  const payload={};for(const key of fields)if(!['id','job_id'].includes(key)&&invoice[key]!==undefined)payload[key]=invoice[key];
  if(!Array.isArray(payload.fleet_job_ids))payload.fleet_job_ids=[];
  payload.mot_due=String(payload.mot_due||'').trim()||null;
  for(const key of ['amount','subtotal','vat','total'])if(payload[key]!=null)payload[key]=Number(payload[key]);
  if(!['subtotal','vat','total'].every(k=>Number.isFinite(payload[k]))||!Array.isArray(payload.lines)||!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.invoice_date||'')))throw Error('Valid invoice lines, totals and date are required.');
  payload.updated_at=new Date().toISOString();
  const controller=new AbortController();let timer;
  try{
   let query=client.from('invoices').update(JSON.parse(JSON.stringify(payload))).eq('id',invoice.id).eq('invoice_number',invoice.invoice_number).eq('updated_at',invoice.updated_at);
   query=invoice.job_id?query.eq('job_id',invoice.job_id):query.is('job_id',null);
   const result=await Promise.race([query.select('*').maybeSingle().abortSignal(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Invoice save could not be confirmed. Refresh and check the saved invoice before retrying.'));},timeoutMs);})]);
   if(result.error)throw result.error;
   const saved=result.data;
   if(!saved)throw Error('This invoice changed on another device. Reopen it from a refreshed invoice list before editing.');
   if(String(saved.id)!==String(invoice.id)||String(saved.invoice_number)!==String(invoice.invoice_number)||String(saved.job_id||'')!==String(invoice.job_id||'')||canonical(saved.lines)!==canonical(payload.lines)||['subtotal','vat','total'].some(k=>saved[k]==null||Math.abs(Number(saved[k])-payload[k])>=0.005))throw Error('The saved invoice receipt did not match. Refresh and check it before retrying.');
   return saved;
  }finally{clearTimeout(timer);controller.abort();}
 }
 async function payment(client,invoice,method,{timeoutMs=12000}={}){
  const next=String(method||'').toLowerCase();
  if(!['','card','cash','bacs'].includes(next))throw Error('Choose a valid payment method.');
  if(!invoice?.id||!invoice.updated_at)throw Error('Refresh the invoice list before recording a payment.');
  const baseline=JSON.parse(JSON.stringify(invoice)),controller=new AbortController();let timer;
  const conflict=()=>Error('This invoice changed on another device. Refresh the invoice list and check it before recording payment.');
  const operation=(async()=>{
   const read=await client.from('invoices').select('*').eq('id',baseline.id).single().abortSignal(controller.signal);
   if(read.error)throw read.error;
   const current=read.data;
   if(!current||String(current.updated_at)!==String(baseline.updated_at)||
      ['invoice_number','job_id','payment_method'].some(k=>String(current[k]||'')!==String(baseline[k]||''))||
      ['subtotal','vat','total'].some(k=>Number(current[k])!==Number(baseline[k]))||canonical(current.lines)!==canonical(baseline.lines))throw conflict();
   const lines=JSON.parse(JSON.stringify(current.lines||[]));
   if(!lines.length)throw Error('Open this invoice and check its work lines before recording payment.');
   const oldDate=String((lines.find(x=>Object.prototype.hasOwnProperty.call(x,'invoice_paid_date'))||{}).invoice_paid_date||'');
   const paidDate=next?(current.payment_method?oldDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())):'';
   lines.forEach((line,i)=>{delete line.invoice_paid_date;if(i===0)line.invoice_paid_date=paidDate;});
   const stamp=new Date(Math.max(Date.now(),Date.parse(current.updated_at)+1)).toISOString();
   const write=await client.from('invoices').update({payment_method:next,lines,updated_at:stamp}).eq('id',baseline.id).eq('updated_at',current.updated_at).select('*').maybeSingle().abortSignal(controller.signal);
   if(write.error)throw write.error;
   if(!write.data)throw conflict();
   const saved=write.data;
   if(String(saved.id)!==String(baseline.id)||String(saved.payment_method||'')!==next||canonical(saved.lines)!==canonical(lines)||
      ['invoice_number','job_id'].some(k=>String(saved[k]||'')!==String(current[k]||''))||['subtotal','vat','total'].some(k=>Number(saved[k])!==Number(current[k])))throw Error('The payment receipt could not be confirmed. Refresh and check this invoice before retrying.');
   return saved;
  })();
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('The payment save could not be confirmed. Refresh and check this invoice before retrying.'));},timeoutMs);})]);}
  finally{clearTimeout(timer);controller.abort();}
 }
 root.VectaInvoiceSave={create,payment,edit};
})(typeof window==='undefined'?globalThis:window);
