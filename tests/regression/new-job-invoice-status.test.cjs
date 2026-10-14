const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../../index.html'), 'utf8');
const source = html.slice(html.indexOf('async function vectaCheckInvoiceActionAgainstCloud('), html.indexOf('function openJobModal(', html.indexOf('async function vectaCheckInvoiceActionAgainstCloud(')));
function setup(result) {
  let reads = 0;
  const alerts = [];
  const context = {navigator:{onLine:true}, console:{warn(){}}, alert:m=>alerts.push(m),jobCompletionEvidence:()=>false,
    remoteClient:{from(){reads++;return {select(){return {eq(){return {limit:async()=>result}}}}}}}};
  vm.createContext(context);vm.runInContext(source, context);
  return {context, alerts, reads:()=>reads};
}
test('new job readiness uses the existing editor ID rather than its unsaved generated ID', async()=>{
  assert.ok(html.includes('readyButton.onclick=async function(){if(!await vectaCheckInvoiceActionAgainstCloud(id))return;'));
  const x=setup({data:[]});
  assert.equal(await x.context.vectaCheckInvoiceActionAgainstCloud(null),true);
  assert.equal(x.reads(),0);assert.equal(x.alerts.length,0);
});
test('existing jobs still require a real server record', async()=>{
  for(const result of [{data:[]},{error:{message:'Connection failed'}}]){
    const x=setup(result);assert.equal(await x.context.vectaCheckInvoiceActionAgainstCloud('existing-id'),false);
    assert.equal(x.reads(),1);assert.equal(x.alerts.length,1);
  }
  const x=setup({data:[{id:'existing-id',status:'booked'}]});
  assert.equal(await x.context.vectaCheckInvoiceActionAgainstCloud('existing-id'),true);
});
