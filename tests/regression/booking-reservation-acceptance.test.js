import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8'),code=html.slice(html.indexOf('async function createJobFromWebsiteRequest('),html.indexOf('async function deleteWebsiteRequestCompletely('));
async function accept(request){
 let saved,closed;
 const c={app:{websiteRequests:[{id:'request',preferred_date_1:'2050-01-04',registration:'AB12CDE',job_types:['Major Service','MOT'],...request}],jobs:[]},websiteRequestCreateBusy:{},remoteClient:{},console,Date,Promise,Number,String,selectedIso:()=> '2050-01-04',selectedDate:null,uid:()=> 'job-id',normaliseJobTypeKey:s=>s.toLowerCase(),normReg:s=>s,websiteRequestNote:()=> 'Website request ID: request',applyWebsiteDefaultMajorService(){},vectaConfirmDuplicateBooking:async()=>true,saveLocal(){},vectaRememberMissingColumn(){},upsertRemote:async(table,row)=>{saved=row},render(){},openJobModal(){},vectaJobIsDeletedForLists:()=>false,websiteRequestIdFromJob:()=>'',alert(message){throw Error(message)}};
 // Match the real Supabase probe's eq(...).limit(...) chain.
 c.remoteClient.from=()=>({select(){return {eq(){return {limit:async()=>({data:[]})}}}},update(value){closed=value;return {eq:async()=>({error:null})}}});
 vm.createContext(c);vm.runInContext(code,c);await c.createJobFromWebsiteRequest('request');return {saved,closed};
}
test('explicit workshop acceptance preserves the server reservation and links its job',async()=>{
 const {saved,closed}=await accept({confirmed_date:'2050-01-11',confirmed_time:'09:30:00',reserved_hours:3.5});assert.equal(saved.booking_date,'2050-01-11');assert.equal(saved.drop_time,'09:30:00');assert.equal(saved.estimated_hours,3.5);assert.equal(saved.technician,'Alfie');assert.equal(closed.job_id,'job-id');assert.equal(closed.status,'booked');
});
test('legacy requests without a server reservation retain manual allocation',async()=>{const {saved}=await accept({});assert.equal(saved.drop_time,'08:00');assert.equal(saved.technician,'Unallocated');});
