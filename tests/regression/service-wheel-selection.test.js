import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const booking=fs.readFileSync('website/booking/index.html','utf8');
const start=booking.indexOf('   const layerRect=layer.getBoundingClientRect();',booking.indexOf('function animateServiceCarWheels()'));
const end=booking.indexOf('   if(wheels.length!==2)',start);
assert.ok(start>=0&&end>start,'wheel selection code must be present');
const select=booking.slice(start,end)+'\nwheels;';
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/service-wheel-geometry.json','utf8'));
// Geometry measured from real supplier drawings; includes hidden tyres and nested rim wrappers.
for(const fixture of fixtures)test(`service wheel selection: ${fixture.model}`,()=>{
 const nodes=new Map(fixture.groups.map(g=>[g.id,{...g,getBBox(){return this.box;},getBoundingClientRect(){return this.box;},contains(other){for(let n=other;n;n=nodes.get(n.parent))if(n.id===this.id)return true;return false;},querySelector(){return this.shapeCount?{}:null;},querySelectorAll(selector){return selector==='g'?[...nodes.values()].filter(n=>n.id!==this.id&&this.contains(n)):{length:this.shapeCount};}}]));
 const selected=vm.runInNewContext(select,{layer:nodes.get(0)});
 assert.equal(selected.length,2,'both visible wheels must be selected');
 const expected=fixture.groups.filter(g=>g.parent===0&&g.shapeCount>=6).map(g=>g.id).sort((a,b)=>a-b);
 assert.deepEqual(Array.from(selected,w=>w.node.id).sort((a,b)=>a-b),expected,'hidden plain tyres and nested rim-only groups must not replace a visible wheel');
});
test('service car watches image readiness and rotates inline artwork',()=>{
 assert.match(booking,/attributeFilter:\['src','data-vehicle-ready'\]/);
 assert.match(booking,/stage\.append\(svg\)/);
 assert.match(booking,/service-animated-artwork/);
 assert.equal(booking,fs.readFileSync('public/booking.html','utf8'));
});
