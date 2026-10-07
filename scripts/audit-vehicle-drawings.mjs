// Repeatable real-source audit. Requires Inkscape; output is temporary, not customer records.
// Run: node scripts/audit-vehicle-drawings.mjs /tmp/vecta-drawings
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {parseHTML,DOMParser} from 'linkedom';
import haynesImage from '../lib/haynes-image.js';
const profiles=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/vehicle-drawing-profiles.json',import.meta.url)));
const output=path.resolve(process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'vecta-drawings-')));
fs.mkdirSync(output,{recursive:true});
const helper=fs.readFileSync(new URL('../public/js/vecta-vehicle-image.js',import.meta.url),'utf8');
const results=[];
for(const profile of profiles){
  try{
    let source;
    await haynesImage({method:'GET',query:{asset:profile.asset}},{setHeader(){},status(code){this.code=code;return this;},json(body){assert.equal(this.code,200,profile.model+' source proxy');source=body.svg;}});
    const {document,window}=parseHTML('<html><body></body></html>');
    const root={document,DOMParser,XMLSerializer:class{serializeToString(node){return node.outerHTML;}}};root.window=root;vm.createContext(root);vm.runInContext(helper,root);
    const safe=root.VectaVehicleImage.sanitiseSvg(source);
    const sourcePath=path.join(output,profile.asset+'.source.svg');fs.writeFileSync(sourcePath,safe.outerHTML);
    const boxes={};
    for(const line of execFileSync('inkscape',[sourcePath,'--query-all'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n')){
      const [id,...values]=line.split(',');if(values.length===4)boxes[id]=Object.fromEntries(['x','y','width','height'].map((key,i)=>[key,Number(values[i])]));
    }
    window.Element.prototype.getBBox=function(){return boxes[this.id]||{x:0,y:0,width:0,height:0};};
    const untouched=selector=>Array.from(safe.querySelectorAll(selector)).map(node=>node.outerHTML).join('');
    for(const colour of ['Blue','Black','White']){
      const r=root.VectaVehicleImage.personaliseSvg(source,'AB12CDE',colour,profile.asset);
      assert.ok(r.recoloured&&r.plateAdded,profile.model+' '+colour);
      const doc=new DOMParser().parseFromString(r.svg,'image/svg+xml');
      for(const selector of ['#wheels','#windows','#lights'])assert.equal(Array.from(doc.querySelectorAll(selector)).map(node=>node.outerHTML).join(''),untouched(selector),profile.model+' preserves '+selector);
      const plate=doc.querySelector('#vecta-front-registration');assert.equal(plate.querySelector('text').textContent,'AB12 CDE');
      const [x,y]=plate.getAttribute('transform').match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
      const body=boxes.transparant_colour||boxes.transparent_colour;
      assert.ok(x>=body.x&&x<body.x+body.width*.25&&y>body.y+body.height*.55&&y<body.y+body.height,profile.model+' plate front position');
      const file=path.join(output,profile.asset+'.'+colour.toLowerCase()+'.svg');fs.writeFileSync(file,r.svg);
      execFileSync('inkscape',[file,'--export-width=598','--export-filename='+file+'.png'],{stdio:'ignore'});
    }
    results.push({model:profile.model,asset:profile.asset,status:'passed',colours:['Blue','Black','White']});
    console.log('PASS '+profile.model);
  }catch(error){results.push({model:profile.model,asset:profile.asset,status:'failed',error:error.message});console.error('FAIL '+profile.model+': '+error.message);}
}
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
console.log('Results: '+path.join(output,'results.json'));
if(results.some(result=>result.status==='failed'))process.exitCode=1;
