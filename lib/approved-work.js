const fail=message=>Object.assign(Error(message),{status:409});
const marker=/\[\[VECTA_PRIVATE_PRICING:([^\]]*)\]\]/;
const pennies=value=>Math.round(Number(value||0)*100);

// Build from the saved job, never from customer-supplied descriptions or prices.
// The database compares this snapshot while locked before committing the decision.
export function approvedJobChanges(job,approval){
  const note=String(job.customer_note||''),match=note.match(marker);
  let items=[];
  if(match){
    try{items=JSON.parse(decodeURIComponent(match[1]));}catch{throw fail('The job pricing needs checking by the workshop before approval.');}
    if(!Array.isArray(items)||items.some(x=>!x||!Number.isFinite(Number(x.price))))throw fail('The job pricing needs checking by the workshop before approval.');
  }
  const pence=approval.progress_estimate_pence;
  if(!Number.isInteger(pence)||pence<0)throw fail('This request does not have a valid price. Please contact the workshop.');
  const base=pennies(job.amount_quoted),sum=items.reduce((n,x)=>n+pennies(x.price),0);
  if(!Number.isFinite(base))throw fail('The job price needs checking by the workshop before approval.');
  if(!items.length&&(job.work_required||job.job_type||base))items.push({description:String(job.work_required||job.job_type||'Previously agreed work'),price:base/100});
  else if(items.length&&sum!==base)items.push({description:'Balance of previously agreed work',price:(base-sum)/100});
  let mode=job.vat_mode||'inc_vat';
  if(mode==='no_vat'){
    // A common starting point is an MOT-only booking. Its invoice line keeps
    // the existing MOT exemption when taxable repair work is added.
    if(items.some(x=>!/^M\.?O\.?T\.?(?: test)?$/i.test(String(x.description).trim())))throw fail('The workshop needs to review the VAT setting before this work can be approved.');
    mode='inc_vat';
  }
  const extra=mode==='ex_vat'?Math.round(pence/1.2):pence;
  items.push({description:approval.progress_message,price:extra/100,progress_approval_id:approval.id});
  const replacement='[[VECTA_PRIVATE_PRICING:'+encodeURIComponent(JSON.stringify(items))+']]';
  return {work_required:[String(job.work_required||'').trim(),approval.progress_message].filter(Boolean).join('\n'),
    customer_note:match?note.replace(marker,()=>replacement):[note,replacement].filter(Boolean).join('\n'),
    amount_quoted:(base+extra)/100,vat_mode:mode};
}

// Customer totals use the saved job and the same proposed update as acceptance.
// A missing price is unknown, not a free booking. MOT-only lines remain exempt.
export function customerQuoteTotals(job,approval){
  const gross=record=>{
    if(record.amount_quoted==null||String(record.amount_quoted).trim()==='')return null;
    const base=pennies(record.amount_quoted),mode=record.vat_mode||'inc_vat';
    if(!Number.isSafeInteger(base)||base<0||!['inc_vat','ex_vat','no_vat'].includes(mode))return null;
    if(mode!=='ex_vat')return base;
    const mot=description=>/^(?:M\.?O\.?T\.?)(?:\s+(?:test(?:\s+fee)?|re[ -]?test|fee))?(?:\s*\([^)]*\))?\.?$/i.test(String(description||'').trim().replace(/\s+/g,' '));
    const match=String(record.customer_note||'').match(marker);
    let exempt=mot(record.work_required||record.job_type)?base:0;
    if(match){
      const items=JSON.parse(decodeURIComponent(match[1]));
      if(!Array.isArray(items)||items.some(item=>!item||!Number.isFinite(Number(item.price))))return null;
      exempt=items.filter(item=>mot(item.description)).reduce((sum,item)=>sum+pennies(item.price),0);
    }
    if(exempt<0||exempt>base)return null;
    return base+Math.round((base-exempt)*0.2);
  };
  let current=null,revised=null;
  try{
    current=gross(job);
    if(current!==null)revised=(approval.status==='pending'||approval.status==='approved'&&approval.progress_apply_on_forward&&!approval.progress_work_applied_at)?gross({...job,...approvedJobChanges(job,approval)}):current;
  }catch{/* Keep an uncertain total unpriced instead of inventing a figure. */}
  return {job_total_pence:current,revised_total_pence:revised};
}

export function mechanicApprovalSummary(item){
  // Explicit allowlist: future financial fields must not silently reach mechanics.
  return {id:item.id,message:String(item.message||'').replace(/(?:£|\bGBP\s*)\s*[\d,]+(?:\.\d+)?(?:\s*(?:inc(?:luding)?|ex(?:cluding)?)\.?\s*VAT)?|\b[\d,]+(?:\.\d+)?\s*(?:pounds?(?:\s+sterling)?|GBP)\b/gi,'[price hidden]'),
    photo_ids:item.photo_ids,status:item.status,decided_at:item.decided_at,
    ...(item.job_id?{job_id:item.job_id,registration:item.registration}:{})};
}

// Office forwarding applies saved quote contents exactly once. Retain all earlier
// parts, fulfilment status and invoice lines; customer replies are notes only.
export function forwardedQuoteChanges(job,approval,event){
 const apply=approval.status==='approved'&&approval.progress_apply_on_forward&&!approval.progress_work_applied_at;
 const result=apply?approvedJobChanges(job,approval):Object.fromEntries(['work_required','customer_note','amount_quoted','vat_mode'].map(key=>[key,job[key]??null]));
 let note=String(result.customer_note||'');
 const reply=String(event.details?.customer_reply||'').trim().replace(/\[\[/g,'［［').replace(/\]\]/g,'］］');
 note=[note,(approval.status==='approved'?'Additional work authorised: ':'Additional work declined: ')+approval.progress_message,reply?'Customer message: '+reply:''].filter(Boolean).join('\n');
 if(apply&&approval.progress_parts?.length){
  const pattern=/\[\[JOB_PARTS_URI:([^\]]*)\]\]/i,match=note.match(pattern);let parts=[];
  if(match){try{parts=JSON.parse(decodeURIComponent(match[1]));}catch{throw fail('The saved parts list needs checking before forwarding.');}}
  if(!Array.isArray(parts))throw fail('The saved parts list needs checking before forwarding.');
  for(const [index,part] of approval.progress_parts.entries()){
   const id=approval.id+'-'+index;
   if(!parts.some(row=>row.id===id))parts.push({id,description:part.description,quantity:part.quantity,cost_price:null,ordered:false,arrived:false});
  }
  const replacement='[[JOB_PARTS_URI:'+encodeURIComponent(JSON.stringify(parts))+']]';
  note=match?note.replace(pattern,()=>replacement):[note,replacement].filter(Boolean).join('\n');
  note=note.replace(/\[\[PARTS_STATUS:[\s\S]*?\]\]/gi,'').trim()+'\n[[PARTS_STATUS:Parts need ordering]]';
 }
 result.customer_note=note;return result;
}
