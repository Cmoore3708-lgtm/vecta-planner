import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readEspSettings,requireEspSettings} from './esp-settings.mjs';
test('hidden duplicate IDs cannot override checkbox state',()=>{
 const {document}=parseHTML('<input type="hidden" id="ShowVat" value="false"><input type="checkbox" id="ShowVat"><input type="hidden" id="ShowSellout" value="false"><input type="checkbox" id="ShowSellout"><input type="checkbox" id="ShowAddOns">');
 for(const el of document.querySelectorAll('input[type="checkbox"]'))el.checked=el.id!=='ShowAddOns';
 const settings=readEspSettings(document);assert.equal(settings.vatIncluded,true);assert.equal(settings.showSellout,true);assert.equal(settings.showAddOns,false);
});
test('ambiguous checkboxes do not pass settings verification',()=>{
 const {document}=parseHTML('<input type="checkbox" id="ShowVat"><input type="checkbox" id="ShowVat">');
 const settings=readEspSettings(document);assert.equal(settings.vatIncluded,null);assert.throws(()=>requireEspSettings(settings));
});
test('only verified Vecta VAT-inclusive single-tyre pricing passes',()=>{
 const valid={showSellout:true,vatIncluded:true,showAddOns:false,priceList:'Vecta',multiplier:1};assert.equal(requireEspSettings(valid).fullyFitted,true);
 for(const patch of [{vatIncluded:false},{priceList:null},{multiplier:4},{showSellout:false}])assert.throws(()=>requireEspSettings({...valid,...patch}));
});
