import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const html=fs.readFileSync('index.html','utf8');
function setup(source){
 const names=['calculatedPartsStatus','normalisePartsStatus','partsStoredStatus','partsStatusFromJob','partsStatusClass','partsStatusDot','mobileJobCardHtml'];
 const code=names.map(name=>{const start=source.indexOf('function '+name+'(');const end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);}).join('\n');
 const c={esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),jobParts:j=>j.parts||[],mobileMotAppointmentHtml:()=>'<span class="mobileMotAppointment">MOT 10:00</span>',jobTypeLabels:()=>['Full Service'],normaliseJobTypeKey:s=>s.toLowerCase(),jobTypeChip:()=>'<span>Full Service</span>',plannerJobDescription:j=>j.work_required||'',isWebsiteBookingJob:j=>!!j.website,jobTypeInlineStyle:()=>'',plannerPlate:()=>'<span class="plannerPlateWrap"><button class="ukPlate">AB12 CDE</button></span>',plannerVehicleLabel:()=> 'Nissan Qashqai',mobileJobCategoryLabel:()=> 'NMUK Internal',carryOverBadgeHtml:()=>''};
 c.dashboardJobTitle=j=>j.work_required||'';c.mechanicWorkView=j=>({board:j.work_required||''});c.plannerTechnicianLane=value=>value==='Other'?'Chris':value;
 vm.createContext(c);vm.runInContext(code,c);return c;
}
for(const [variant,source] of [['Main',html],['mechanics',mechanicVariant(html)]]){
 test(variant+' phone cards show the correct parts light immediately after the registration plate',()=>{
  const c=setup(source);
  for(const [status,colour] of [['Parts need ordering','red'],['Awaiting parts','amber'],['Parts here','green'],['Not required','green']]){
   for(const group of ['Alfie','Chris','Unallocated Jobs']){
    const card=c.mobileJobCardHtml({id:'job',parts_status:status,work_required:'Extra work'},group);
    const {document}=parseHTML(card),dot=document.querySelector('.mobilePlateAndParts > .plannerPlateWrap + .cardPartsStatusDot');
    assert.ok(dot);assert.ok(dot.classList.contains('parts-'+colour));assert.equal(dot.getAttribute('aria-label'),status);assert.equal(document.querySelectorAll('.cardPartsStatusDot').length,1);
    assert.match(document.textContent||card,/Extra work/);assert.ok(document.querySelector('.mobileMotAppointment'));
   }
  }
 });
 test(variant+' phone parts lights follow ordering/arrival changes and blank tasks have no dot',()=>{
  const c=setup(source),job={id:'job',parts:[{ordered:false,arrived:false}]};
  assert.match(c.mobileJobCardHtml(job),/parts-red/);job.parts[0].ordered=true;assert.match(c.mobileJobCardHtml(job),/parts-amber/);job.parts[0].arrived=true;assert.match(c.mobileJobCardHtml(job),/parts-green/);
  assert.doesNotMatch(c.mobileJobCardHtml({id:'task',card_type:'mini_task'}),/cardPartsStatusDot/);
  assert.match(c.mobileJobCardHtml({id:'job',customer_note:'[[PARTS_STATUS:Awaiting parts]]'}),/parts-amber/);
 });
}
test('parts dot position override is confined to the phone plate row',()=>{
 const css=fs.readFileSync('public/js/haynes-job-tools.css','utf8');
 const block=css.slice(css.indexOf('/* Phone dashboard: keep the parts light'));
 assert.match(block,/@media screen and \(max-width:768px\)/);assert.match(block,/\.mobilePlanner \.mobilePlateAndParts>\.cardPartsStatusDot\{position:static!important/);assert.match(block,/flex:0 0 12px/);
});
test('phone cards omit prices, retain the mechanic and escape first names',()=>{
 const c=setup(html);
 const job={id:'job',technician:'Other',customer_name:'Anne-Marie Smith',customer_account:'Staff',amount_quoted:0,parts_status:'Parts here'};
 const {document}=parseHTML(c.mobileJobCardHtml(job,'Chris'));
 assert.equal(document.querySelector('.mobileJobTypes + .mobileJobAssignment .mobileJobMechanic').textContent,'Chris');
 assert.equal(document.querySelector('.mobileJobPrice'),null);
 assert.equal(document.querySelector('.mobileJobCategory').textContent,'Anne-Marie');
 assert.ok(document.querySelector('.mobileJobAssignment + .mobileJobCategory'));
 c.jobTypeLabels=()=>['General'];
 const noType=parseHTML(c.mobileJobCardHtml(job)).document;
 assert.ok(noType.querySelector('.mobileVehicleTop + .mobileJobAssignment'));
 assert.ok(noType.querySelector('.mobileJobAssignment + .mobileJobCategory'));
 for(const price of [0,145,null,undefined,''])assert.doesNotMatch(c.mobileJobCardHtml({...job,amount_quoted:price}),/mobileJobPrice|Unpriced|£/);
 const escaped=parseHTML(c.mobileJobCardHtml({...job,customer_name:'<img src=x> Smith'})).document;
 assert.equal(escaped.querySelector('.mobileJobCategory').textContent,'<img');
 assert.equal(escaped.querySelector('.mobileJobCategory img'),null);
 assert.equal(job.customer_name,'Anne-Marie Smith');
});
test('phone assignment never exposes quotes on a mechanics deployment',()=>{
 const c=setup(mechanicVariant(html));c.window={VECTA_MECHANIC_DEPLOYMENT:true};
 const card=c.mobileJobCardHtml({id:'job',technician:'Alfie',amount_quoted:125,customer_name:'Chris Moore'});
 assert.doesNotMatch(card,/mobileJobPrice|£125/);
 assert.match(card,/mobileJobMechanic/);
});
