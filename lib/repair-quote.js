import './repair-scope.js';
export const repairScope=globalThis.VectaRepairScope;
// Monetary values are integer pence; VAT-inclusive totals are explicitly named. No catalogue guesses.
export const REPAIR_POLICY = Object.freeze({markupModel:'marginal-bands-v1',roundUpPence:500,vatBps:2000,markupBands:Object.freeze([Object.freeze({upToPence:5000,percent:50}),Object.freeze({upToPence:15000,percent:20}),Object.freeze({upToPence:null,percent:10})]),surchargeMode:'excluded',labourRatePence:5000,labourIncrementMilli:500,validForMs:15*60*1000});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const text=(v,max=180)=>typeof v==='string'&&v.trim().length<=max?v.trim():'';
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
// Round the combined VAT-inclusive selling price, retaining a net adjustment.
export function roundedRepairTotal(baseNetPence){
 if(!money(baseNetPence))fail('INVALID_QUOTE_TOTAL');
 const totalIncVatPence=Math.ceil((baseNetPence+Math.round(baseNetPence/5))/500)*500;
 const netPence=Math.round(totalIncVatPence/1.2);
 return {netPence,vatPence:totalIncVatPence-netPence,totalIncVatPence,roundingNetPence:netPence-baseNetPence};
}
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
 const scope=repairScope.resolve(work);
 if(scope.status!=='SUPPORTED')fail(scope.status);
 if(input.operation&&input.operation!==scope.operation||input.quantity!==undefined&&input.quantity!==scope.quantity)fail('INVALID_REQUEST');
 const request={registration,work,operation:scope.operation,quantity:scope.quantity};
 if(input.lookup!==undefined&&input.lookup!==scope.lookup)fail('INVALID_REQUEST');
 if(scope.lookup)request.lookup=scope.lookup;
 if(input.flow!==undefined||scope.lookup){
  if(input.flow!==undefined&&input.flow!=='guided-v1')fail('INVALID_REQUEST');
  const c=input.choices||{};
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['gsfCategory','part','labour','menus','labourSearch'].includes(k)))fail('INVALID_REQUEST');
  const choices={};
  for(const key of ['gsfCategory','part','labour'])if(c[key]!==undefined){if(!/^[a-f0-9]{32}$/.test(c[key]))fail('INVALID_REQUEST');choices[key]=c[key];}
  if(c.menus!==undefined){if(!Array.isArray(c.menus)||c.menus.length>8||c.menus.some(v=>!text(v,100)))fail('INVALID_REQUEST');choices.menus=c.menus.map(v=>v.trim());}
  if(c.labourSearch!==undefined){if(!text(c.labourSearch,150))fail('INVALID_REQUEST');choices.labourSearch=c.labourSearch.trim();}
  if(scope.lookup==='labour'&&(choices.part||choices.gsfCategory)||scope.lookup==='parts'&&(choices.labour||choices.menus?.length||choices.labourSearch))fail('INVALID_REQUEST');
  if(scope.lookup!=='labour'&&(choices.labour||choices.menus?.length||choices.labourSearch)&&!choices.part)fail('INVALID_REQUEST');
  Object.assign(request,{flow:'guided-v1',choices});
 }else if(input.choices!==undefined)fail('INVALID_REQUEST');
 return request;
}
// Choices carry identifiers and labels only. The PC re-reads the selected live
// row before using its price/time; no client-supplied amount is accepted.
export function cleanRepairChoices(raw,request,{now=Date.now()}={}){
 const expected=repairRequest(request);
 if(expected.flow!=='guided-v1'||!raw||JSON.stringify(repairRequest(raw.request))!==JSON.stringify(expected)||!recent(raw.checkedAt,now,5*60*1000))fail('INVALID_CHOICES');
 if(!['GSF_CATEGORY','GSF_PART','HAYNES_MENU','HAYNES_LABOUR'].includes(raw.stage)||!Array.isArray(raw.options)||raw.options.length>40)fail('INVALID_CHOICES');
 if(expected.lookup==='labour'&&!raw.stage.startsWith('HAYNES_')||expected.lookup==='parts'&&raw.stage.startsWith('HAYNES_'))fail('INVALID_CHOICES');
 const ids=new Set();
 const options=raw.options.map(o=>{
  if(!/^[a-f0-9]{32}$/.test(o.id||'')||ids.has(o.id)||!text(o.label,250))fail('INVALID_CHOICES');ids.add(o.id);
  const result={id:o.id,label:text(o.label,250),detail:text(o.detail,500)};
  if(o.categoryChoice!==undefined){if(raw.stage!=='GSF_CATEGORY'||!/^[a-f0-9]{32}$/.test(o.categoryChoice))fail('INVALID_CHOICES');result.categoryChoice=o.categoryChoice;}
  if(o.work!==undefined){if(!text(o.work,250))fail('INVALID_CHOICES');result.work=o.work;}
  if(o.costPence!==undefined){if(!money(o.costPence)||!o.costPence)fail('INVALID_CHOICES');result.costPence=o.costPence;}
  if(o.inStock!==undefined){if(raw.stage!=='GSF_PART'||typeof o.inStock!=='boolean')fail('INVALID_CHOICES');result.inStock=o.inStock;}
  if(o.hoursMilli!==undefined){if(!Number.isInteger(o.hoursMilli)||o.hoursMilli<=0||o.hoursMilli>100000)fail('INVALID_CHOICES');result.hoursMilli=o.hoursMilli;}
  return result;
 });
 const result={request:expected,stage:raw.stage,options,checkedAt:raw.checkedAt};
 if(raw.selectionKind!==undefined){if(raw.stage!=='GSF_CATEGORY'||raw.selectionKind!=='product')fail('INVALID_CHOICES');result.selectionKind='product';}
 if(raw.stage.startsWith('HAYNES_')&&expected.lookup!=='labour'){
  const p=raw.selectedPart;if(!expected.choices.part||!p||!text(p.description,250)||!text(p.brand,80)||!text(p.sku,80)||!money(p.costPence)||!p.costPence)fail('INVALID_CHOICES');
  result.selectedPart={description:text(p.description,250),brand:text(p.brand,80),sku:text(p.sku,80),costPence:p.costPence};
  if(p.inStock!==undefined){if(typeof p.inStock!=='boolean')fail('INVALID_CHOICES');result.selectedPart.inStock=p.inStock;}
 }
 return result;
}
function recent(value,now,age=REPAIR_POLICY.validForMs){const t=Date.parse(value);return Number.isFinite(t)&&t>=now-age&&t<=now+60000;}
function imageUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function repairPartUrl(value){
 return typeof value==='string'&&/^https:\/\/trade\.gsfcarparts\.com\/(?:enhancedSearch|partdetails)\/[A-Za-z0-9._-]{1,100}$/.test(value)?value:'';
}
export function cleanRepairEvidence(raw,request,{now=Date.now()}={}) {
 const expected=repairRequest(request);
 if(!raw||JSON.stringify(repairRequest(raw.request))!==JSON.stringify(expected)||!recent(raw.checkedAt,now))fail('STALE_OR_WRONG_VEHICLE');
 const scope=repairScope.resolve(expected.work);
 const needPart=expected.lookup!=='labour',needLabour=expected.lookup!=='parts';
 if(expected.flow==='guided-v1'&&((needPart&&(!expected.choices.part||raw.parts?.length!==1||raw.parts[0].choiceId!==expected.choices.part))||(needLabour&&(!expected.choices.labour||raw.labour?.choiceId!==expected.choices.labour))))fail('REVIEW_REQUIRED');
 if(expected.operation!=='alternator-replacement'&&(!raw.scope||Object.keys(scope).some(key=>raw.scope[key]!==scope[key])))fail('REVIEW_REQUIRED');
 const variant=text(raw.variant,250),fitment=text(raw.fitmentEvidence,500);
 if(!variant||!fitment||raw.catalogueComplete!==true||!Array.isArray(raw.parts)||needPart&&(raw.parts.length<1||raw.parts.length>100)||!needPart&&raw.parts.length!==0||!needLabour&&raw.labour!==null)fail('REVIEW_REQUIRED');
 const parts=raw.parts.map(p=>{
  if(!expected.flow&&expected.operation==='catalogue-replacement'&&!repairScope.matchesDescription(p.description||'',scope.query))fail('REVIEW_REQUIRED');
  if(p.source!=='GSF'||p.registration!==expected.registration||p.variant!==variant||p.fitmentConfirmed!==true||p.vatBasis!=='EX_VAT'||!money(p.costPence)||p.costPence===0||!text(p.sku,80)||!text(p.brand,80)||!text(p.description,250)||!recent(p.checkedAt,now)||typeof p.inStock!=='boolean')fail('REVIEW_REQUIRED');
  return {source:'GSF',registration:expected.registration,variant,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:text(p.sku,80),brand:text(p.brand,80),description:text(p.description,250),costPence:p.costPence,corePence:0,inStock:p.inStock,imageUrl:imageUrl(p.imageUrl),gsfUrl:repairPartUrl(p.gsfUrl),checkedAt:p.checkedAt,...(expected.flow?{choiceId:p.choiceId}:{})};
 });
 const available=parts.filter(p=>p.inStock).sort((a,b)=>a.costPence-b.costPence||a.sku.localeCompare(b.sku));
 // Guided pricing uses the one explicitly selected part, including a priced
 // out-of-stock choice. Automatic legacy selection still requires stock.
 if(needPart&&!expected.flow&&!available.length)fail('OUT_OF_STOCK');
 const l=raw.labour;
 if(needLabour&&(!l||l.source!=='HAYNES_PRO'||l.registration!==expected.registration||l.variant!==variant||l.operation!==expected.operation||l.unit!=='hours'||!Number.isInteger(l.hoursMilli)||l.hoursMilli<=0||l.hoursMilli>100000||l.scopeConfirmed!==true||!text(l.operationLabel,250)||!text(l.operationId,100)||!recent(l.checkedAt,now)))fail('LABOUR_REVIEW_REQUIRED');
 return {request:expected,...(raw.scope?{scope}:{}),variant,fitmentEvidence:fitment,catalogueComplete:true,checkedAt:raw.checkedAt,parts,labour:needLabour?{source:'HAYNES_PRO',registration:expected.registration,variant,operation:expected.operation,operationId:text(l.operationId,100),operationLabel:text(l.operationLabel,250),hoursMilli:l.hoursMilli,unit:'hours',scopeConfirmed:true,checkedAt:l.checkedAt,...(expected.flow?{choiceId:l.choiceId}:{})}:null};
}
export function calculateRepairQuote(raw,request,options={}) {
 const evidence=cleanRepairEvidence(raw,request,options);
 const part=evidence.request.lookup==='labour'?null:evidence.request.flow?evidence.parts[0]:evidence.parts.filter(p=>p.inStock).sort((a,b)=>a.costPence-b.costPence||a.sku.localeCompare(b.sku))[0];
 const chargedHoursMilli=evidence.labour?Math.ceil(evidence.labour.hoursMilli/REPAIR_POLICY.labourIncrementMilli)*REPAIR_POLICY.labourIncrementMilli:0;
 const partsPence=part?repairPartsPrice(part.costPence*evidence.request.quantity):0,labourPence=chargedHoursMilli*REPAIR_POLICY.labourRatePence/1000;
 const oldest=Math.min(...[evidence.checkedAt,part?.checkedAt,evidence.labour?.checkedAt].filter(Boolean).map(Date.parse));
 return {request:evidence.request,variant:evidence.variant,part,labour:evidence.labour,policy:REPAIR_POLICY,partsPence,chargedHoursMilli,labourPence,corePence:0,surchargeExcluded:true,payableNetPence:roundedRepairTotal(partsPence+labourPence).netPence,...roundedRepairTotal(partsPence+labourPence),vatBasis:'EX_VAT',checkedAt:evidence.checkedAt,expiresAt:new Date(oldest+REPAIR_POLICY.validForMs).toISOString(),alternativesChecked:evidence.parts.length};
}
