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

export function mechanicApprovalSummary(item){
  // Explicit allowlist: future financial fields must not silently reach mechanics.
  return {id:item.id,message:String(item.message||'').replace(/(?:£|\bGBP\s*)\s*[\d,]+(?:\.\d+)?(?:\s*(?:inc(?:luding)?|ex(?:cluding)?)\.?\s*VAT)?/gi,'[price hidden]'),
    photo_ids:item.photo_ids,status:item.status,decided_at:item.decided_at,
    ...(item.job_id?{job_id:item.job_id,registration:item.registration}:{})};
}
