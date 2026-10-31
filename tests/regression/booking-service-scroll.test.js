import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
function setup({dialog=false,step=2}={}){
 const {document,window}=parseHTML('<div id="app"><div class="tyre-picker"><img data-loaded="true"><button data-wheel>Selected tyre</button></div><div class="service-picker"></div></div>');
 const app=document.getElementById('app'),tyres=document.querySelector('.tyre-picker'),oldService=document.querySelector('.service-picker');
 const scrolls=[],focuses=[],bound=[];
 window.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this===oldService?140:360};};
 window.HTMLElement.prototype.focus=function(options){focuses.push(options);};
 window.scrollBy=options=>scrolls.push(options);
 const state={step,mileage_dialog_open:dialog,form:{}};
 const c={state,document,window,app,servicePricing:{update(){}},bookingProgressHtml:()=>'',haynesHtml:()=>'',vehicleSummaryHtml:()=>'',stepHtml:()=>'<div class="tyre-picker"><img data-loaded="false"></div><div class="service-picker"><button class="service-option selected">Full</button></div>',serviceOfferEligible:()=>false,alignVehicleHeader(){},applyAdminCopy(){},bind(){bound.push(document.querySelector('.tyre-picker'));},bindV137(){},renderActions(){},bindMileageDialog(){}};
 vm.createContext(c);const start=html.indexOf('function render(){');vm.runInContext(html.slice(start,html.indexOf('// Reuse one request identity',start)),c);
 return {c,tyres,document,scrolls,focuses,bound};
}
test('switching services retains the loaded tyre picker and restores the service viewport before focusing without scroll',()=>{
 const s=setup();s.c.render({preserveServicePosition:true,focusServiceChoice:true});
 assert.equal(s.document.querySelector('.tyre-picker'),s.tyres);
 assert.equal(s.bound[0],s.tyres);assert.equal(s.document.querySelector('[data-loaded]').dataset.loaded,'true');
 assert.equal(s.scrolls.length,1);assert.equal(s.scrolls[0].top,220);assert.equal(s.scrolls[0].behavior,'instant');
 assert.equal(s.focuses.length,1);assert.equal(s.focuses[0].preventScroll,true);
});
test('an open required mileage dialog keeps its normal focus and ordinary navigation does not retain tyre DOM',()=>{
 const dialog=setup({dialog:true});dialog.c.render({preserveServicePosition:true});assert.equal(dialog.scrolls.length,0);assert.equal(dialog.focuses.length,0);
 for(const options of [{},{step:3}]){const s=setup(options);s.c.render(options.step?{preserveServicePosition:true}:undefined);assert.notEqual(s.document.querySelector('.tyre-picker'),s.tyres);assert.equal(s.scrolls.length,0);assert.equal(s.focuses.length,0);}
});

test('background service prices retain the tyre artwork without taking focus from tyre inputs',()=>{
 const s=setup();s.c.render({preserveServicePosition:true});assert.equal(s.document.querySelector('.tyre-picker'),s.tyres);assert.equal(s.focuses.length,0);
});
