import {navigateGSFAlternator} from './gsf-navigation.mjs';
import {expandGSFAlternatives} from './gsf-alternatives.mjs';
import {analyseAlternatorOptions} from '../gsf/alternator-options.mjs';
import {verifyRepairSelection} from '../gsf/verify-repair-selection.mjs';
const reject=detail=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail});};
const normal=value=>String(value||'').trim().replace(/\s/g,'').toUpperCase();
export function confirmExpandedGSF(snapshot,analysis,expectedSku){
 const b=snapshot?.boundary;
 if(!b||b.version!==1||b.truncated!==false||b.loading!==false||b.unparsedSkuLabels!==0||!Array.isArray(b.groupSkus)||b.groupSkus.length!==1||b.groupSkus[0]!==expectedSku||b.showMore!==0||b.showLess!==1||!Array.isArray(b.paginationControls)||b.paginationControls.length)reject('EXPANDED_CATALOGUE_BOUNDARY_UNCONFIRMED');
 if(analysis.displayedGroupSku!==expectedSku||!Number.isInteger(analysis.expandedGroupOptionsCount)||analysis.expandedGroupOptionsCount<1||analysis.expandedGroupOptionsCount>100||analysis.expandedGroupOptionsCount!==analysis.displayedOptionCount)reject('EXPANDED_GROUP_UNPARSED');
 return {method:'single-expanded-group',groupSku:expectedSku,optionsChecked:analysis.displayedOptionCount};
}
// Only called after reviewedMapping has approved this registration/variant.
// An absent Show More control alone is never proof of a complete catalogue.
export async function readLiveGSFAlternator(page,request,mapping,config,{now=Date.now,navigate=navigateGSFAlternator,expand=expandGSFAlternatives,verify=verifyRepairSelection}={}){
 if((!config.totalCount&&config.completionMode!=='single-expanded-group')||!mapping.gsfPart)throw Object.assign(Error('SETTINGS_REQUIRED'),{code:'SETTINGS_REQUIRED'});
 const navigation=await navigate(page,request.registration);
 if(navigation.status!=='AUTOMATIC_CATEGORY_REACHED'||navigation.registrationSubmitted!==true||navigation.observed?.selectedRegistration!==true||navigation.observed?.categoryPathMatched!==true)reject('REGISTRATION_NOT_CONFIRMED');
 const snapshot=await expand(page,request.registration);
 const identityCheck={requestRegistration:request.registration,capturedRegistration:snapshot.registration||'',identityCount:snapshot.identities?.length||0,expected:normal(mapping.gsfIdentity),observed:(snapshot.identities||[]).slice(0,4).map(row=>normal(row.text).slice(0,220))};
 if(snapshot.registration!==request.registration||snapshot.identities?.length!==1||identityCheck.observed[0]!==identityCheck.expected){const error=Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail:'VEHICLE_IDENTITY_MISMATCH',identityCheck});throw error;}
 const analysis=analyseAlternatorOptions(snapshot);
 if(config.completionMode==='single-expanded-group')confirmExpandedGSF(snapshot,analysis,mapping.gsfPart.searchTerm);
 else{
 const count=page.locator(config.totalCount);
 if(await count.count()!==1||!await count.isVisible())reject('CATALOGUE_COUNT_NOT_VISIBLE');
 const total=(await count.innerText()).trim();
 if(!/^\d+$/.test(total)||Number(total)<1||Number(total)>100||snapshot.candidates?.length!==snapshot.candidateCount)reject('CATALOGUE_COUNT_MISMATCH');
 if(analysis.displayedOptionCount!==Number(total))reject('UNPARSED_CATALOGUE_OPTIONS');
 }
 if(!analysis.cheapestDisplayedAvailable)throw Object.assign(Error('OUT_OF_STOCK'),{code:'OUT_OF_STOCK'});
 const selected=await verify(page,analysis,mapping.gsfPart,{now});
 if(!selected.priceMatchesCatalogue||selected.unitNetPence!==analysis.cheapestDisplayedAvailable.costPence||selected.brand!==analysis.cheapestDisplayedAvailable.brand||selected.sku!==mapping.gsfPart.sku)reject('SELECTED_PART_CHANGED');
 return {catalogueComplete:true,alternativesChecked:analysis.displayedOptionCount,parts:[{source:'GSF',registration:request.registration,variant:mapping.variant,fitmentConfirmed:true,vatBasis:selected.vatBasis,sku:selected.sku,brand:selected.brand,description:selected.description,costPence:selected.unitNetPence,corePence:0,inStock:selected.inStock,imageUrl:selected.imageUrl,gsfUrl:selected.gsfUrl,checkedAt:selected.checkedAt}]};
}
