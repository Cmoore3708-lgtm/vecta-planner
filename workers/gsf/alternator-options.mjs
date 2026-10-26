// Analyse calibration evidence only. Does not assert catalogue completeness,
// approve compatibility, or assign the selected group's SKU to other brands.
export function analyseAlternatorOptions(snapshot){
 const fail=()=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED'});};
 if(!snapshot||!Array.isArray(snapshot.candidates)||!snapshot.candidates.length||snapshot.candidateCount!==snapshot.candidates.length)fail();
 const brands={drivetec:'DriveTec',lucas:'Lucas',denso:'Denso',elstock:'Elstock',wai:'WAI',autoelectro:'Autoelectro'};
 const options=[];
 for(const candidate of snapshot.candidates){
  const card=candidate.ancestors?.find(row=>row.depth===1);if(!card)fail();
  const match=card.text.match(/^£(\d+(?:,\d{3})*)\.(\d{2})\s+(Silver|Gold|Bronze)\s+(Alternator(?:\s*-\s*150 Amp)?)\s+(Local Branch|RDC|Branch Network|Out Of Stock)$/i);
  if(!match)fail();
  const costPence=Number(match[1].replaceAll(',',''))*100+Number(match[2]);if(!Number.isSafeInteger(costPence)||costPence<1)fail();
  const names=(card.images||[]).map(image=>{
   try{const url=new URL(image.src);if(url.origin!=='https://gsfappstorage.blob.core.windows.net')return '';const key=url.pathname.match(/^\/catalogue-assets\/Brands\/([a-z]+)\.svg$/i)?.[1]?.toLowerCase();return brands[key]||'';}catch{return '';}
  }).filter(Boolean);
  if(names.length!==1)fail();
  const stockLabel=match[5];
  options.push({brand:names[0],description:match[4],costPence,stockLabel,displayedAvailable:!/^Out Of Stock$/i.test(stockLabel)});
 }
 const available=options.filter(row=>row.displayedAvailable).sort((a,b)=>a.costPence-b.costPence||a.brand.localeCompare(b.brand));
 const selected=available[0]||null;
 // GSF omits the Alternator description from zero-price unavailable cards.
 // Those cards are absent from the priced-leaf capture but present in its
 // bounded group container. Account for them without inventing brand or SKU.
 const container=snapshot.candidates[0].ancestors.find(row=>row.depth===2);
 let unpricedUnavailableCount=0,expandedGroupOptionsCount=null;
 if(container&&/\bShow Less$/.test(container.text)){
  let remaining=container.text.replace(/\s+Show Less$/,'');const parsed=[];
  while(remaining){
   const row=remaining.match(/^£(\d+(?:,\d{3})*)\.(\d{2})\s+(Silver|Gold|Bronze)(?:\s+(Alternator(?:\s*-\s*150 Amp)?))?\s+(Local Branch|RDC|Branch Network|Out Of Stock)(?:\s+|$)/i);
   if(!row)fail();
   const costPence=Number(row[1].replaceAll(',',''))*100+Number(row[2]);
   if(costPence===0){if(row[4]||!/^Out Of Stock$/i.test(row[5]))fail();unpricedUnavailableCount++;}
   else {if(!row[4])fail();parsed.push({costPence,description:row[4],stockLabel:row[5]});}
   remaining=remaining.slice(row[0].length);
  }
  if(parsed.length!==options.length||parsed.some((row,i)=>row.costPence!==options[i].costPence||row.description!==options[i].description||row.stockLabel!==options[i].stockLabel))fail();
  expandedGroupOptionsCount=parsed.length+unpricedUnavailableCount;
 }
 const group=snapshot.candidates[0].ancestors.find(row=>/\bSKU:/.test(row.text));
 const displayedGroupSku=group?.text.match(/\bSKU:\s*([A-Z0-9.-]+)/)?.[1]||'';
 const images=snapshot.candidates[0].ancestors.flatMap(row=>row.images||[]).map(row=>row.src).filter(src=>{try{const url=new URL(src);return url.origin==='https://gsfappstorage.blob.core.windows.net'&&/\/ProductImages\//i.test(url.pathname);}catch{return false;}});
 return {status:'DISPLAYED_OPTIONS_ANALYSED',options,unpricedUnavailableCount,displayedOptionCount:options.length+unpricedUnavailableCount,expandedGroupOptionsCount,cheapestDisplayedAvailable:selected,displayedGroupSku,imageUrl:images[0]||'',catalogueComplete:false,fitmentConfirmed:false,verifiedPart:null};
}
