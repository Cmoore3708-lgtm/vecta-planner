import {REPAIR_POLICY,repairPartsPrice} from '../../lib/repair-quote.js';
// Read-only arithmetic preview, never accepted as production quote evidence.
export function repairLookupPreview(part,labour,{now=Date.now()}={}){
 const fail=()=>{throw Error('REVIEW_REQUIRED');};
 if(!part?.priceMatchesCatalogue||part.vatBasis!=='EX_VAT'||part.inStock!==true||!Number.isSafeInteger(part.unitNetPence)||part.unitNetPence<=0||!Number.isSafeInteger(labour?.hoursMilli)||labour.hoursMilli<1||labour.hoursMilli>100000||!part.registration||part.registration!==labour.registration)fail();
 for(const stamp of [part.checkedAt,labour.checkedAt]){const time=Date.parse(stamp);if(!Number.isFinite(time)||time>now||now-time>REPAIR_POLICY.validForMs)fail();}
 const salePence=repairPartsPrice(part.unitNetPence),chargedHoursMilli=Math.ceil(labour.hoursMilli/REPAIR_POLICY.labourIncrementMilli)*REPAIR_POLICY.labourIncrementMilli;
 const labourPence=chargedHoursMilli*REPAIR_POLICY.labourRatePence/1000,netPence=salePence+labourPence,vatPence=Math.round(netPence/5);
 return {previewOnly:true,readyForAutomaticQuote:false,registration:part.registration,partsCostPence:part.unitNetPence,partsSalePence:salePence,sourceLabourHoursMilli:labour.hoursMilli,chargedHoursMilli,labourPence,netPence,vatPence,totalIncVatPence:netPence+vatPence,surchargeExcluded:true,imageUrl:part.imageUrl,reviewReasons:['Vehicle fitment and catalogue completeness are not yet approved for automatic quoting.']};
}
