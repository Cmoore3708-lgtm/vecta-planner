import test from 'node:test';
import assert from 'node:assert/strict';
import {browserLookup} from '../../workers/haynes/vehicle-browser.mjs';

function fixture(){
 let pages=0,gotos=0,submitted='',previous='',reads=0;
 const page={closed:false,visible:false,setDefaultTimeout(){},isClosed(){return this.closed;},async close(){this.closed=true;},async route(){},async unroute(){},
 async goto(){gotos++;this.visible=true;previous='';},
 locator(selector){return {isVisible:async()=>page.visible,fill:async value=>{submitted=value;reads=0;},click:async()=>{}};},
 async evaluate(){
   // First read after a new submission still shows the previous vehicle.
   const registration=reads++===0?previous:submitted;
   if(registration)previous=registration;
   return {registration,make:'NISSAN',model:'Qashqai',variant:'1.5 dCi',typeId:'t_123'};
 }};
 return {page,context:{newPage:async()=>{pages++;return page;}},get pages(){return pages;},get gotos(){return gotos;}};
}
test('reuses one plate field and ignores stale vehicle data after the next submission',async()=>{
 const f=fixture(),lookup=browserLookup(f.context,{reusePage:true});
 assert.equal((await lookup('AB12CDE')).registration,'AB12CDE');
 assert.equal((await lookup('CD34EFG')).registration,'CD34EFG');
 assert.equal(f.pages,1);assert.equal(f.gotos,1);assert.equal(f.page.closed,false);
});
test('navigates back to search when the plate field is unavailable',async()=>{
 const f=fixture(),lookup=browserLookup(f.context,{reusePage:true});
 await lookup('AB12CDE');f.page.visible=false;
 await lookup('CD34EFG');assert.equal(f.pages,1);assert.equal(f.gotos,2);
});
test('failed retained tab closes, preserving login-required status',async()=>{
 const f=fixture();f.page.evaluate=async()=>({login:true});
 await assert.rejects(browserLookup(f.context,{reusePage:true})('AB12CDE'),{code:'LOGIN_REQUIRED'});
 assert.equal(f.page.closed,true);
});
