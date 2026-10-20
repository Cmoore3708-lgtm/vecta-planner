// MVC pages can contain hidden inputs with the same id as their checkbox.
// Read only actual checkbox inputs and refuse ambiguous duplicates.
export function readEspSettings(document){
 const checkbox=id=>{
  const controls=Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(el=>el.id===id);
  return {count:controls.length,checked:controls.length===1?controls[0].checked===true:null};
 };
 const sellout=checkbox('ShowSellout'),vat=checkbox('ShowVat'),addons=checkbox('ShowAddOns');
 const selects=Array.from(document.querySelectorAll('select')).filter(el=>el.id==='PriceList1Id');
 let priceList=null;
 if(selects.length===1){
  const selected=Array.from(selects[0].options).filter(o=>o.selected);
  if(selected.length===1 && /^vecta$/i.test(selected[0].textContent.trim()))priceList='Vecta';
 }
 const multipliers=Array.from(document.querySelectorAll('input')).filter(el=>el.id==='Multiplier' && el.type!=='hidden');
 const value=multipliers.length===1?multipliers[0].value:'';
 const multiplier=/^\d+(?:\.\d+)?$/.test(value)?Number(value):null;
 return {showSellout:sellout.checked,vatIncluded:vat.checked,showAddOns:addons.checked,priceList,multiplier,checkboxCounts:{sellout:sellout.count,vat:vat.count,addons:addons.count}};
}
export function requireEspSettings(settings){
 if(settings.showSellout!==true || settings.vatIncluded!==true || settings.priceList!=='Vecta' || settings.multiplier!==1)throw Error('ESP_PRICE_SETTINGS_NOT_VERIFIED');
 // Addons is not forced on: Chris confirms Sellout already includes fitting.
 return {vatIncluded:true,fullyFitted:true};
}
