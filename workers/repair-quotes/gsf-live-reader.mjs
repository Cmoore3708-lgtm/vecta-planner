import {navigateGSFAlternator} from './gsf-navigation.mjs';
import {expandGSFAlternatives} from './gsf-alternatives.mjs';
import {analyseAlternatorOptions} from '../gsf/alternator-options.mjs';
import {verifyRepairSelection} from '../gsf/verify-repair-selection.mjs';
const reject=detail=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail});};
const normal=value=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
// Only called after reviewedMapping has approved this registration/variant.
// An absent Show More control alone is never proof of a complete catalogue.
export async function readLiveGSFAlternator(page,request,mapping,config,{now=Date.now,navigate=navigateGSFAlternator,expand=expandGSFAlternatives,verify=verifyRepairSelection}={}){
 if(!config.totalCount||!mapping.gsfPart)throw Object.assign(Error('SETTINGS_REQUIRED'),{code:'SETTINGS_REQUIRED'});
 const navigation=await navigate(page,request.registration);
 if(navigation.status!=='AUTOMATIC_CATEGORY_REACHED'||navigation.registrationSubmitted!==true||navigation.observed?.selectedRegistration!==true||navigation.observed?.categoryPathMatched!==true)reject('REGISTRATION_NOT_CONFIRMED');
 const snapshot=await expand(page,request.registration);
 if(snapshot.registration!==request.registration||snapshot.identities?.length!==1||normal(snapshot.identities[0].text)!==normal(mapping.gsfIdentity))reject('VEHICLE_IDENTITY_MISMATCH');
 const count=page.locator(config.totalCount);
 if(await count.count()!==1||!await count.isVisible())reject('CATALOGUE_COUNT_NOT_VISIBLE');
 const total=(await count.innerText()).trim();
 if(!/^\d+$/.test(total)||Number(total)<1||Number(total)>100||snapshot.candidates?.length!==snapshot.candidateCount)reject('CATALOGUE_COUNT_MISMATCH');
 const analysis=analyseAlternatorOptions(snapshot);
 if(analysis.displayedOptionCount!==Number(total))reject('UNPARSED_CATALOGUE_OPTIONS');
 if(!analysis.cheapestDisplayedAvailable)throw Object.assign(Error('OUT_OF_STOCK'),{code:'OUT_OF_STOCK'});
 const selected=await verify(page,analysis,mapping.gsfPart,{now});
 if(!selected.priceMatchesCatalogue||selected.unitNetPence!==analysis.cheapestDisplayedAvailable.costPence||selected.brand!==analysis.cheapestDisplayedAvailable.brand||selected.sku!==mapping.gsfPart.sku)reject('SELECTED_PART_CHANGED');
 return {catalogueComplete:true,alternativesChecked:analysis.displayedOptionCount,parts:[{source:'GSF',registration:request.registration,variant:mapping.variant,fitmentConfirmed:true,vatBasis:selected.vatBasis,sku:selected.sku,brand:selected.brand,description:selected.description,costPence:selected.unitNetPence,corePence:0,inStock:selected.inStock,imageUrl:selected.imageUrl,gsfUrl:selected.gsfUrl,checkedAt:selected.checkedAt}]};
}
