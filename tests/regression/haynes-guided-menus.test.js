import test from 'node:test';
import assert from 'node:assert/strict';
import {guidedMaintenance,menuDescriptor} from '../../workers/haynes/maintenance-menus.mjs';
import {serviceRequest,serviceResult} from '../../lib/haynes-service.js';
const vehicle={registration:'HGZ7396',typeId:'t_318011818',make:'Audi',model:'A4',variant:'2.0 TDI'};
function pageFor(changed=false) {
 let stage=0,selected=[];
 const menus=[{kind:'select',index:0,name:'maintenance',label:'Maintenance schedule',options:[{value:'ms_1',label:'Longlife service (United Kingdom)'},{value:'ms_2',label:'Fixed service (United Kingdom)'}]}, {kind:'select',index:1,name:'useType',label:'Manufacturer question we have never seen',options:[{value:'ordinary',label:changed?'Changed option':'Ordinary use'},{value:'intense',label:'Special use'}]}, {kind:'select',index:2,name:'inspection',label:'Another new manufacturer question',options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}]}];
 const page={url:()=>stage===4?'https://www.workshopdata.com/touch/site/layout/maintenanceSchedule?typeId=t_318011818&maintenanceSystemId=ms_1&maintenancePeriodId=mp_2':'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_318011818',evaluate:async fn=>{
  if(fn.name==='readMaintenanceMenus')return {menus:menus.slice(0,Math.min(stage+1,3)),unsupported:[]};
  if(fn.name==='readConditionSchedules')return [{label:'Oil service + Inspection service',href:'https://www.workshopdata.com/touch/site/layout/maintenanceSchedule?typeId=t_318011818&maintenanceSystemId=ms_1&maintenancePeriodId=mp_2'}];
  if(fn.name==='readSchedule')return {period:'mp_2',schedule:'Oil service + Inspection service',parts:['Oil filter']};
 },locator(){return {nth(){return {selectOption:async({value})=>{selected.push(value);stage++;}}}};},waitForLoadState:async()=>{},goto:async()=>{stage=4}};
 return {page,selected};
}
test('unseen nested dropdowns are returned automatically and replay only advertised selections',async()=>{
 const input={registration:'HGZ7396',mileage:101000,menuFlow:'guided',menuChoices:[]};
 for(let n=0;n<4;n++) {
  const x=pageFor();const result=await guidedMaintenance(x.page,input,vehicle,{pauseFor:async()=>{}});
  assert.equal(result.kind,'menu_choice');assert.equal(result.menu.options.length,n===3?1:2);
  assert.ok(result.menu.options.every(o=>!('value' in o)&&!('href' in o)));
  if(n===1)assert.equal(result.menu.label,'Manufacturer question we have never seen');
  input.menuChoices.push({menu:result.menu.id,option:result.menu.options[0].id});
 }
 const x=pageFor();const result=await guidedMaintenance(x.page,input,vehicle,{pauseFor:async()=>{}});
 assert.equal(result.system,'ms_1');assert.equal(result.schedule.parts[0],'Oil filter');assert.deepEqual(x.selected,['ms_1','ordinary','yes']);
});
test('changed supplier options return the affected menu instead of applying stale answers',async()=>{
 const input={registration:'HGZ7396',mileage:101000,menuFlow:'guided',menuChoices:[]};
 for(let n=0;n<2;n++){const result=await guidedMaintenance(pageFor().page,input,vehicle,{pauseFor:async()=>{}});input.menuChoices.push({menu:result.menu.id,option:result.menu.options[0].id});}
 const x=pageFor(true);const result=await guidedMaintenance(x.page,input,vehicle,{pauseFor:async()=>{}});
 assert.equal(result.resetFrom,1);assert.deepEqual(x.selected,['ms_1']);assert.equal(result.menu.options[0].label,'Changed option');
});
test('guided request and response cannot carry supplier URLs, selector code or hidden values',()=>{
 const menu=menuDescriptor({kind:'select',name:'anything',label:'New question',options:[{label:'First',value:'PRIVATE'}]});
 const input=serviceRequest({registration:'HGZ7396',mileage:101000,menuFlow:'guided',menuChoices:[{menu:menu.id,option:menu.options[0].id,href:'https://evil.example'}]});
 assert.equal(input.menuChoices[0].href,undefined);
 const result=serviceResult({kind:'menu_choice',menuFlow:'guided',vehicle,mileage:101000,period:'',menu},input);
 assert.equal(result.menu.options[0].value,undefined);assert.equal(result.menu.index,undefined);
 assert.throws(()=>serviceRequest({...input,menuChoices:[{menu:'select#secret',option:'javascript:alert(1)'}]}));
 assert.throws(()=>serviceResult({...result,vehicle:{...vehicle,registration:'OTHER'}},input));
});

import {parseHTML} from 'linkedom';
import {readMaintenanceMenus} from '../../workers/haynes/service-dom.mjs';
test('native dropdown discovery uses maintenance scope rather than a label whitelist',()=>{
 const {document,window}=parseHTML('<html><body><select name="language"><option value="en">English</option></select><form method="get" action="https://www.workshopdata.com/touch/site/layout/maintenanceSchedule"><label for="unknown">Previously unseen question</label><select id="unknown"><option value="">Select</option><option value="x">Manufacturer-specific A</option><option value="y">Manufacturer-specific B</option></select></form></body></html>');
 const old={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle};
 window.Element.prototype.getClientRects=()=>[{}];globalThis.document=document;globalThis.location={href:'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_1'};globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
 try{const result=readMaintenanceMenus();assert.equal(result.menus.length,1);assert.equal(result.menus[0].label,'Previously unseen question');assert.deepEqual(result.menus[0].options.map(o=>o.label),['Manufacturer-specific A','Manufacturer-specific B']);}finally{Object.assign(globalThis,old);}
});
test('unsupported POST forms produce an explicit manual step instead of a guessed selection',async()=>{
 const page={url:()=> 'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_1',evaluate:async()=>({menus:[],unsupported:[{kind:'post-form',label:'Maintenance question requires form support'}]})};
 const result=await guidedMaintenance(page,{menuChoices:[]},vehicle,{pauseFor:async()=>{}});
 assert.equal(result.kind,'manual_step');assert.match(result.message,/form support/);
});

test('large menus expose every option in bounded ranges and replay the exact supplier selection',async()=>{
 const options=Array.from({length:251},(_,i)=>({value:'ms_'+(i+1),label:'Schedule '+(i+1)}));
 const menu={kind:'select',index:0,name:'large',label:'Service options',options};
 function fixture(){let selected='';return {selected:()=>selected,page:{url:()=>selected?'https://www.workshopdata.com/touch/site/layout/maintenanceSchedule?typeId=t_318011818&maintenanceSystemId='+selected+'&maintenancePeriodId=mp_1':'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_318011818',evaluate:async fn=>fn.name==='readMaintenanceMenus'?{menus:selected?[]:[menu],unsupported:[]}:fn.name==='readSchedule'?{period:'mp_1',schedule:'Selected service',parts:[]}:[],locator:()=>({nth:()=>({selectOption:async({value})=>{selected=value;}})}),waitForLoadState:async()=>{}}};}
 const input={registration:vehicle.registration,mileage:40000,menuFlow:'guided',menuChoices:[]};
 let f=fixture(),result=await guidedMaintenance(f.page,input,vehicle,{pauseFor:async()=>{}});
 assert.equal(result.kind,'menu_choice');assert.equal(result.menu.options.length,6);assert.equal(f.selected(),'');
 assert.equal(serviceResult({...result,menuFlow:'guided',vehicle,mileage:40000},input).menu.options[0].child,undefined);
 input.menuChoices.push({menu:result.menu.id,option:result.menu.options[4].id});
 f=fixture();result=await guidedMaintenance(f.page,input,vehicle,{pauseFor:async()=>{}});
 assert.equal(result.menu.options.length,50);assert.equal(result.menu.options[0].label,'Schedule 201');assert.equal(f.selected(),'');
 input.menuChoices.push({menu:result.menu.id,option:result.menu.options[24].id});
 f=fixture();result=await guidedMaintenance(f.page,input,vehicle,{pauseFor:async()=>{}});
 assert.equal(f.selected(),'ms_225');assert.equal(result.system,'ms_225');
});
