import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync(new URL('../../public/js/vecta-fleet-images.js',import.meta.url),'utf8');
function setup(saved=true){const {window}=parseHTML('<html><body></body></html>');const vehicles=[{id:'internal',fleetGroup:'Nissan Internal',registration:'TCS 1',model:'Golf Buggy'},{id:'pool',fleetGroup:'Nissan Pool Cars',model:'Leaf'}];let calls=0;const root={fleetVehicles:vehicles,saveFleet:async()=>{calls++;return saved;}};vm.runInNewContext(source,{window:root,document:window.document,MutationObserver:class{observe(){}},queueMicrotask});return {api:root.VectaFleetImages,vehicles,calls:()=>calls};}
test('on-site descriptions choose carts, vans, pickups and SUVs without live lookups',()=>{const {api}=setup();for(const [name,type] of [['Elec cart','cart'],['Golf Buggy','cart'],['NV 200','van'],['EV200','van'],['Primastar','van'],['Pick UP','pickup'],['X-Trail','suv'],['Leaf','car']])assert.equal(api.kind(name),type);assert.match(api.artwork('Golf Buggy','Red'),/#ac1727/);});
test('internal colour saves through shared Fleet persistence and survives serialisation',async()=>{const {api,vehicles,calls}=setup();await api.saveColour('internal','Blue');assert.equal(calls(),1);assert.equal(JSON.parse(JSON.stringify(vehicles))[0].colour,'Blue');assert.ok(vehicles[0].updated_at);});
test('colour picker cannot modify pool vehicles or accept unknown colours',async()=>{const {api,vehicles,calls}=setup();await assert.rejects(api.saveColour('pool','Blue'));await assert.rejects(api.saveColour('internal','invalid'));assert.equal(calls(),0);assert.equal(vehicles[0].colour,undefined);assert.equal(vehicles[1].colour,undefined);});
test('failed cloud save keeps local selection and reports that sync is incomplete',async()=>{const {api,vehicles}=setup(false);await assert.rejects(api.saveColour('internal','Green'),/has not synced/);assert.equal(vehicles[0].colour,'Green');});
