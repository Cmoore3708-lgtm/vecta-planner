import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function vectaSaveLinkedVehicleWithoutDuplicate(');
const end=html.indexOf('async function syncSavedJobBundleInBackground(',start);
assert.ok(start>0&&end>start,'vehicle save helper exists');
function setup(rows,options={}){
  const calls=[];
  const app={vehicles:options.localVehicles||[],jobs:[{id:'job1',vehicle_id:'temporary'}]};
  const ctx={
    navigator:{onLine:true},remoteClient:{
      from(table){assert.equal(table,'vehicles');return {
        select(){return this},in(column,values){assert.equal(column,'registration');calls.push(['lookup',values]);return this},
        limit(){return Promise.resolve({data:rows,error:null})}
      }}
    },app,
    normReg:v=>String(v||'').toUpperCase().replace(/\s+/g,''),
    async upsertRemote(table,row){calls.push(['insert',table,row.id]);if(options.insertError)throw options.insertError;return [{id:row.id}]},
    saveLocal(){calls.push(['saveLocal'])},console
  };
  vm.runInNewContext(html.slice(start,end),ctx);
  return {ctx,calls,app};
}
test('existing OW24UFJ registration is reused without another vehicle insert',async()=>{
  const {ctx,calls,app}=setup([{id:'canonical',registration:'OW24UFJ'}],{localVehicles:[{id:'temporary',registration:'OW24 UFJ',vehicle:'Ford'}]});
  const j={id:'job1',registration:'OW24 UFJ',vehicle_id:'temporary'},linked={vehicle:{id:'temporary',registration:'OW24 UFJ'}};
  await ctx.vectaSaveLinkedVehicleWithoutDuplicate(j,linked);
  assert.equal(j.vehicle_id,'canonical');assert.equal(linked.vehicle.id,'canonical');
  assert.equal(app.jobs[0].vehicle_id,'canonical');
  assert.equal(app.vehicles[0].vehicle,'Ford');
  assert.equal(calls.filter(x=>x[0]==='insert').length,0);
});
test('new registration is inserted once',async()=>{
  const {ctx,calls}=setup([]);
  await ctx.vectaSaveLinkedVehicleWithoutDuplicate({registration:'AB24 XYZ'},{vehicle:{id:'new',registration:'AB24XYZ'}});
  assert.equal(calls.filter(x=>x[0]==='insert').length,1);
});
test('concurrent duplicate insert reuses the winning vehicle',async()=>{
  const {ctx,calls}=setup([{id:'winning',registration:'OW24 UFJ'}],{insertError:{code:'23505',message:'duplicate key value violates unique constraint "vehicles_registration_key"'}});
  let lookupCount=0;
  ctx.remoteClient.from=()=>({select(){return this},in(){return this},limit(){lookupCount++;return Promise.resolve({data:lookupCount===1?[]:[{id:'winning',registration:'OW24 UFJ'}],error:null})}});
  const j={id:'job1',registration:'OW24UFJ'},linked={vehicle:{id:'temporary',registration:'OW24UFJ'}};
  await ctx.vectaSaveLinkedVehicleWithoutDuplicate(j,linked);
  assert.equal(j.vehicle_id,'winning');assert.equal(lookupCount,2);
  assert.equal(calls.filter(x=>x[0]==='insert').length,1);
});
test('unrelated vehicle write failures remain visible',async()=>{
  const {ctx}=setup([],{insertError:{code:'42501',message:'permission denied'}});
  await assert.rejects(ctx.vectaSaveLinkedVehicleWithoutDuplicate({registration:'AB24XYZ'},{vehicle:{id:'new',registration:'AB24XYZ'}}),/permission denied/);
});
