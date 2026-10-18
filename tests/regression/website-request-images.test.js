import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8').split('/* Dashboard registration lookup:')[0];
test('booking cards reuse the correct stored vehicle image and colour without a Haynes lookup',()=>{
  const {document}=parseHTML('<body><main><article class="requestCard" data-request-id="a"><div class="requestVehicleArtwork"></div></article><article class="requestCard" data-request-id="b"><div class="requestVehicleArtwork"></div></article></main></body>');
  const storage=new Map();let lookups=0;
  const window={document,navigator:{onLine:true},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},fetch:()=>{lookups++;throw Error('Unexpected lookup')},VectaVehicleImage:{mount(){},colourHex:()=> '#334455',resolveColour:(registration,colour)=>colour}};
  vm.runInNewContext(source,{window,document,AbortController,AbortSignal,setTimeout,clearTimeout,encodeURIComponent});
  for(const [registration,make,model,asset,colour] of [['NV12WRJ','Ford','Focus','10001','BLUE'],['ND13GKC','Volkswagen','Tiguan','10002','GREY']])window.VectaHaynesJobTools.remember({registration,make,model,variant:'1.6',typeId:'t_123',fetchedAt:new Date().toISOString(),imageUrl:'https://www.haynespro-assets.com/workshop/images/'+asset+'.svg',colour});
  const requests=[{id:'a',registration:'NV12WRJ',vehicle:'FORD FOCUS',colour:'BLUE'},{id:'b',registration:'ND13GKC',vehicle:'VOLKSWAGEN TIGUAN',colour:'GREY'}];
  const container=document.querySelector('main');
  window.enrichHaynesDashboard(container,requests);window.enrichHaynesDashboard(container,requests);
  for(const [id,registration,asset,colour] of [['a','NV12WRJ','10001','BLUE'],['b','ND13GKC','10002','GREY']]){
    const images=container.querySelectorAll('[data-request-id="'+id+'"] .requestVehicleArtwork img');assert.equal(images.length,1);
    assert.equal(images[0].dataset.registration,registration);assert.match(images[0].dataset.vehicleSource,new RegExp(asset));assert.equal(images[0].dataset.colour,colour);
  }
  assert.equal(lookups,0);
});
