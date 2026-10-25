// All monetary values are integer pence, excluding VAT. No catalogue guesses.
export const REPAIR_POLICY = Object.freeze({markupModel:'marginal-bands-v1',markupBands:Object.freeze([Object.freeze({upToPence:5000,percent:50}),Object.freeze({upToPence:15000,percent:20}),Object.freeze({upToPence:null,percent:10})]),labourRatePence:5000,validForMs:15*60*1000});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const text=(v,max=180)=>typeof v==='string'&&v.trim().length<=max?v.trim():'';
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
// Marginal bands apply only to the cost within each band; round once to pennies.
export function repairPartsPrice(costPence){
 if(!money(costPence))fail('INVALID_PART_COST');
 const weighted=Math.min(costPence,5000)*50+Math.min(Math.max(costPence-5000,0),10000)*20+Math.max(costPence-15000,0)*10;
 return costPence+Math.round(weighted/100);
}
export function repairRequest(input={}) {
 const registration=String(input.registration||'').toUpperCase().replace(/\s/g,'');
 const work=text(input.work,250).replace(/\s+/g,' ');
 if(!/^[A-Z0-9]{2,8}$/.test(registration)||!work)fail('INVALID_REQUEST');
 // The first calibrated operation is alternator replacement. Multi-part jobs
 // need their own scopes; matching one word must never price the whole job.
 if(!/^(?:(?:supply\s+(?:and|&)\s+fit|replace|fit|renew)\s+)?(?:an?\s+)?alternator[.!]?$/i.test(work))fail('UNSUPPORTED_OPERATION');
 return {registration,work,operation:'alternator-replacement',quantity:1};
}
function recent(value,now,age=REPAIR_POLICY.validForMs){const t=Date.parse(value);return Number.isFinite(t)&&t>=now-age&&t<=now+60000;}
function imageUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function cleanRepairEvidence(raw,request,{now=Date.now()}={}) {
 const expected=repairRequest(request);
 if(!raw||JSON.stringify(repairRequest(raw.request))!==JSON.stringify(expected)||!recent(raw.checkedAt,now))fail('STALE_OR_WRONG_VEHICLE');
 const variant=text(raw.variant,250),fitment=text(raw.fitmentEvidence,500);
 if(!variant||!fitment||raw.catalogueComplete!==true||!Array.isArray(raw.parts)||raw.parts.length<1||raw.parts.length>100)fail('REVIEW_REQUIRED');
 const parts=raw.parts.map(p=>{
  if(p.source!=='GSF'||p.registration!==expected.registration||p.variant!==variant||p.fitmentConfirmed!==true||p.vatBasis!=='EX_VAT'||!money(p.costPence)||p.costPence===0||!money(p.corePence)||!text(p.sku,80)||!text(p.brand,80)||!text(p.description,250)||!recent(p.checkedAt,now)||typeof p.inStock!=='boolean')fail('REVIEW_REQUIRED');
  return {source:'GSF',registration:expected.registration,variant,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:text(p.sku,80),brand:text(p.brand,80),description:text(p.description,250),costPence:p.costPence,corePence:p.corePence,inStock:p.inStock,imageUrl:imageUrl(p.imageUrl),checkedAt:p.checkedAt};
 });
 const available=parts.filter(p=>p.inStock).sort((a,b)=>a.costPence-b.costPence||a.corePence-b.corePence||a.sku.localeCompare(b.sku));
 if(!available.length)fail('OUT_OF_STOCK');
 const l=raw.labour;
 if(!l||l.source!=='HAYNES_PRO'||l.registration!==expected.registration||l.variant!==variant||l.operation!==expected.operation||l.unit!=='hours'||!Number.isInteger(l.hoursMilli)||l.hoursMilli<=0||l.hoursMilli>100000||l.scopeConfirmed!==true||!text(l.operationLabel,250)||!text(l.operationId,100)||!recent(l.checkedAt,now))fail('LABOUR_REVIEW_REQUIRED');
 return {request:expected,variant,fitmentEvidence:fitment,catalogueComplete:true,checkedAt:raw.checkedAt,parts,labour:{source:'HAYNES_PRO',registration:expected.registration,variant,operation:expected.operation,operationId:text(l.operationId,100),operationLabel:text(l.operationLabel,250),hoursMilli:l.hoursMilli,unit:'hours',scopeConfirmed:true,checkedAt:l.checkedAt}};
}
export function calculateRepairQuote(raw,request,options={}) {
 const evidence=cleanRepairEvidence(raw,request,options);
 const part=evidence.parts.filter(p=>p.inStock).sort((a,b)=>a.costPence-b.costPence||a.corePence-b.corePence||a.sku.localeCompare(b.sku))[0];
 const partsPence=repairPartsPrice(part.costPence),labourPence=Math.round(evidence.labour.hoursMilli*REPAIR_POLICY.labourRatePence/1000);
 const oldest=Math.min(Date.parse(evidence.checkedAt),Date.parse(part.checkedAt),Date.parse(evidence.labour.checkedAt));
 return {request:evidence.request,variant:evidence.variant,part,labour:evidence.labour,policy:REPAIR_POLICY,partsPence,labourPence,netPence:partsPence+labourPence,corePence:part.corePence,payableNetPence:partsPence+labourPence+part.corePence,vatBasis:'EX_VAT',checkedAt:evidence.checkedAt,expiresAt:new Date(oldest+REPAIR_POLICY.validForMs).toISOString(),alternativesChecked:evidence.parts.length};
}
