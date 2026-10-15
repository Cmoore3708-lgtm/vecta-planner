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
 root.VectaInvoiceSave={create};
})(typeof window==='undefined'?globalThis:window);
