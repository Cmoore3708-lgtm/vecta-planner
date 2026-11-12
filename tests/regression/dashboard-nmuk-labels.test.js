import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=fs.readFileSync('index.html','utf8');
for(const [name,source] of [['Main',main],['mechanics',mechanicVariant(main)]])test(name+': dashboard NMUK names use the short subtype without changing customer records',()=>{
 const start=source.indexOf('function mobileJobCategoryLabel('),context={fleetIncomeCustomerForJob:j=>j.customer_account,fleetNmukTypeFromVehicle:()=>''};
 vm.runInNewContext(source.slice(start,source.indexOf('\nfunction ',start+1)),context);
 for(const [value,label] of [['Pool','Pool'],['NMUK Pool Cars','Pool'],['internal','Internal'],['NMUK Internal','Internal'],['mvos','MVOS'],['NMUK MVOS Cars','MVOS']]){
  const job={customer_account:'NMUK',customer_name:'NMUK Pool Cars',nmuk_vehicle_type:value},before=JSON.stringify(job);
  assert.equal(context.mobileJobCategoryLabel(job),label);assert.equal(JSON.stringify(job),before);
 }
 assert.equal(context.mobileJobCategoryLabel({customer_account:'Staff',customer_name:'Chris Moore'}),'Chris');
 assert.equal(context.mobileJobCategoryLabel({customer_account:'OWBEN',customer_name:'Customer'}),'OWBEN');
 assert.equal(context.mobileJobCategoryLabel({customer_account:'NMUK',nmuk_type:'MVOS'}),'MVOS');
 context.fleetNmukTypeFromVehicle=()=> 'Internal';
 assert.equal(context.mobileJobCategoryLabel({customer_account:'NMUK',nmuk_vehicle_type:'Pool'}),'Internal','reconciled fleet subtype keeps precedence');
});
