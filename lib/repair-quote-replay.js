import {REPAIR_POLICY,repairPartsPrice,repairRequest,roundedRepairTotal} from './repair-quote.js';
// Sanitised evidence from the user's successful 2026-10-26.9 PC check.
// This is a UI replay only: it cannot become validated worker evidence.
export function repairReplayAvailable(env){
 if(env.VERCEL_ENV==='production'&&env.VERCEL_GIT_COMMIT_REF==='main')return true;
 return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF==='amendment/repair-quote-lookup'&&
  (!env.VECTA_TEST_SUPABASE_URL||env.VECTA_TEST_SUPABASE_URL.replace(/\/$/,'')==='https://brqsejjykrubxuofavuu.supabase.co');
}
export function repairReplayQuote(raw,{now=Date.now()}={}){
 const request=repairRequest(raw);
 if(request.registration!=='FV65JTY')throw Error('INVALID_REQUEST');
 const variant='Honda CR-V 1.6 i-DTEC (N16A4) 2015–2017';
 const part={source:'GSF',registration:request.registration,variant,sku:'A8828',gsfUrl:'https://trade.gsfcarparts.com/enhancedSearch/DREA8828',brand:'DriveTec',description:'Alternator - 150 Amp',costPence:19474,inStock:true,vatBasis:'EX_VAT',fitmentConfirmed:false,checkedAt:'2026-10-26T10:39:38.602Z',imageUrl:'https://gsfappstorage.blob.core.windows.net/catalogue-assets//ProductImages/WAI/21126N_B1.jpg'};
 const labour={source:'HAYNES_PRO',registration:request.registration,variant,operation:request.operation,operationId:'1E02944501WV0',operationLabel:'Renew the alternator',hoursMilli:700,unit:'hours',checkedAt:'2026-10-26T10:39:43.830Z'};
 const partsPence=repairPartsPrice(part.costPence),chargedHoursMilli=1000,labourPence=5000;
 return {previewOnly:true,readyForAutomaticQuote:false,evidenceCapturedAt:part.checkedAt,reviewReasons:['Vehicle fitment and catalogue completeness still require review.'],request,variant,part,labour,policy:REPAIR_POLICY,partsPence,chargedHoursMilli,labourPence,...roundedRepairTotal(partsPence+labourPence),corePence:0,surchargeExcluded:true,vatBasis:'EX_VAT',checkedAt:part.checkedAt,
  // Only the editable test session expires here; original source times stay intact.
  expiresAt:new Date(now+REPAIR_POLICY.validForMs).toISOString()};
}
