import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync('index.html','utf8');
const names=new Set(['hydrateWebsiteProvisionalDetails','reconcileWebsiteProvisionalInbox','installProvisionalBookingActions','openWebsiteRequestJobCard','applyWebsiteDefaultService']);
let source='';
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(![...names].some(name=>match[1].includes('function '+name+'(')))continue;
 traverse(parse(match[1],{sourceType:'script'}),{FunctionDeclaration(p){if(names.has(p.node.id.name))source+=match[1].slice(p.node.start,p.node.end)+'\n';}});
}
const id='11111111-1111-4111-8111-111111111111';
test('website inbox opens the same provisional job with all four controls and no acceptance override',()=>{
 const {document}=parseHTML('<div id="jobModal"><div class="jobModalHead"><h2></h2></div><div class="modalFoot"></div></div>');
 const job={id,status:'provisional'},calls=[];
 const c={document,app:{jobs:[job]},saveProvisionalBooking:(id,confirmed)=>calls.push([id,confirmed]),deleteJobCompletely:(id,options)=>calls.push([id,options.provisional])};
 c.openJobModal=(opened,draft)=>{assert.equal(opened,id);c.installProvisionalBookingActions(document.getElementById('jobModal'),draft,opened,false)};
 vm.createContext(c);vm.runInContext(source,c);c.openWebsiteRequestJobCard({id:'request'},job);
 const modal=document.getElementById('jobModal');
 assert.equal(modal.dataset.websiteRequestId,undefined);
 assert.deepEqual([...modal.querySelectorAll('.modalFoot button')].map(x=>x.textContent),['Close','Confirm Booking','Cancel booking','Save changes']);
 modal.querySelector('#saveProvisionalChanges').onclick();modal.querySelector('#confirmProvisionalBooking').onclick();
 assert.deepEqual(calls,[[id,false],[id,true]]);
});
test('server snapshot preserves Staff classification and mileage without overwriting later edits',()=>{
 const c={};vm.createContext(c);vm.runInContext(source,c);
 const note='[[VECTA_WEB_DETAILS:'+encodeURIComponent(JSON.stringify({customer_account:'Staff',mileage:'45678'}))+']]';
 const job=c.hydrateWebsiteProvisionalDetails({customer_note:note});assert.equal(job.customer_account,'Staff');assert.equal(job.mileage,45678);
 const edited=c.hydrateWebsiteProvisionalDetails({...job,customer_account:'CONTRACTOR',mileage:50000});assert.equal(edited.customer_account,'CONTRACTOR');assert.equal(edited.mileage,50000);
 assert.doesNotThrow(()=>c.hydrateWebsiteProvisionalDetails({customer_note:'[[VECTA_WEB_DETAILS:%invalid]]'}));
});
test('saved changes retain pending inbox status, while confirmation and cancellation remove the pending count',()=>{
 const request={id:'request',job_id:id,status:'contacted'},c={app:{websiteRequests:[request]},isWebsiteBookingJob:()=>true,websiteRequestIdFromJob:()=> 'request'};
 vm.createContext(c);vm.runInContext(source,c);
 c.reconcileWebsiteProvisionalInbox({id,status:'provisional',booking_date:'2050-01-05',drop_time:'11:00',estimated_hours:2});
 assert.equal(request.status,'contacted');assert.equal(request.confirmed_date,'2050-01-05');assert.equal(request.reserved_hours,2);
 c.reconcileWebsiteProvisionalInbox({id,status:'booked'});assert.equal(request.status,'booked');
 c.reconcileWebsiteProvisionalInbox({id,status:'provisional',archived:true});assert.equal(request.status,'cancelled');
});
test('defaulting a generic Service label cannot silently enlarge a provisional hold',()=>{
 const c={isWebsiteBookingJob:()=>true,jobTypeValues:()=>['Service'],normaliseJobTypeKey:s=>s.toLowerCase(),jobTypeStorageValue:v=>v.join(' || '),templateDataForType:()=>({work_required:'Full service',estimated_hours:1.5})};
 vm.createContext(c);vm.runInContext(source,c);
 const job=c.applyWebsiteDefaultService({status:'provisional',estimated_hours:1,work_required:'Service'});
 assert.equal(job.job_type,'Full Service');assert.equal(job.estimated_hours,1);
});
