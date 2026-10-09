import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { parseHTML, DOMParser } from 'linkedom';
import haynesImage from '../../lib/haynes-image.js';
const helper = fs.readFileSync('public/js/vecta-vehicle-image.js','utf8');
function browser() {
  const {document,window} = parseHTML('<html><body></body></html>');
  window.Element.prototype.getBBox = function() { return this.id==='windows' ? {x:90,y:62,width:167,height:36} : {x:26,y:59,width:247,height:110}; };
  const root = {document,DOMParser,XMLSerializer:class {serializeToString(node){return node.outerHTML;}},AbortSignal,console};
  root.window=root;vm.createContext(root);vm.runInContext(helper,root);return root;
}
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 299 220" onload="alert(1)"><script>alert(1)</script><g id="wheels"><path fill="#333333" d="M0 0"/></g><g id="transparant_colour"><path opacity="0.7" fill="#CCCCCC" d="M0 0"/><path fill="none" stroke="#000000" d="M0 0"/></g><g id="windows"><path fill="#222222" d="M0 0"/></g><foreignObject><iframe src="https://evil.example"/></foreignObject><image href="https://evil.example"/><path style="fill:url(https://evil.example)" d="M0 0"/></svg>';
test('body recolour preserves wheels, windows and outlines; plate contains only this registration',()=>{
  const root=browser(),r=root.VectaVehicleImage.personaliseSvg(svg,'FX69 XWU','BLUE');
  assert.equal(r.recoloured,true);assert.equal(r.plateAdded,true);
  const doc=new DOMParser().parseFromString(r.svg,'image/svg+xml');
  assert.equal(doc.querySelector('#transparant_colour path').getAttribute('fill'),'#235b9a');
  assert.equal(doc.querySelector('#wheels path').getAttribute('fill'),'#333333');
  assert.equal(doc.querySelector('#windows path').getAttribute('fill'),'#222222');
  assert.equal(doc.querySelectorAll('#transparant_colour path')[1].getAttribute('fill'),'none');
  assert.equal(doc.querySelector('#vecta-front-registration text').textContent,'FX69 XWU');
  assert.doesNotMatch(r.svg,/script|onload|foreignObject|iframe|https:\/\/evil/);
  assert.equal(root.document.body.children.length,0);
  const next=root.VectaVehicleImage.personaliseSvg(svg,'NU67VSE','RED');
  assert.match(next.svg,/NU67 VSE/);assert.doesNotMatch(next.svg,/FX69/);
});
test('newer Illustrator switch wrapper retains the green Qashqai drawing and registration',()=>{
  const root=browser();
  const wrapped=svg.replace('<g id="wheels">','<switch><foreignObject><iframe src="https://evil.example"/></foreignObject><g><g id="wheels">').replace('</svg>','</g></switch></svg>');
  const r=root.VectaVehicleImage.personaliseSvg(wrapped,'CM14KEL','Green','319106279.svgz');
  const doc=new DOMParser().parseFromString(r.svg,'image/svg+xml');
  assert.equal(r.recoloured,true);assert.equal(r.plateAdded,true);
  assert.equal(doc.querySelector('#transparant_colour path').getAttribute('fill'),'#296145');
  assert.equal(doc.querySelector('#vecta-front-registration text').textContent,'CM14 KEL');
  assert.equal(doc.querySelector('#vecta-front-registration').getAttribute('transform'),'translate(35.5 141.8) skewY(8)');
  assert.equal(doc.querySelector('#wheels path').getAttribute('fill'),'#333333');
  assert.doesNotMatch(r.svg,/switch|foreignObject|iframe|evil|script|onload/);
});
test('missing or unknown colour keeps original paint; unsupported drawings do not get a misplaced plate',()=>{
  const root=browser();
  for(const colour of ['', 'MULTI-COLOUR']) {
    const r=root.VectaVehicleImage.personaliseSvg(svg,'FX69XWU',colour);
    assert.equal(r.recoloured,false);assert.match(r.svg,/#CCCCCC/);assert.equal(r.plateAdded,true);
  }
  const r=root.VectaVehicleImage.personaliseSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>','FX69XWU','RED');
  assert.equal(r.plateAdded,false);assert.equal(r.recoloured,false);
});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};}
test('asset proxy bounds source to numeric supplier SVG IDs and handles gzip and uncompressed SVG',async()=>{
  const original=global.fetch;let calls=0;
  try {
    for(const bytes of [Buffer.from(svg),gzipSync(svg)]) {
      global.fetch=async url=>{calls++;assert.equal(url,'https://www.haynespro-assets.com/workshop/images/319004648.svgz');return new Response(bytes);};
      const res=response();await haynesImage({method:'GET',query:{asset:'319004648.svgz'}},res);
      assert.equal(res.code,200);assert.equal(res.body.svg,svg);
    }
    for(const asset of ['https://evil.example/a.svg','../1.svg','1.svg?x=1','1.png','1.svg#x']) {
      const res=response();await haynesImage({method:'GET',query:{asset}},res);assert.equal(res.code,400);
    }
    assert.equal(calls,2);
    global.fetch=async()=>new Response(Buffer.alloc(2000001));
    const res=response();await haynesImage({method:'GET',query:{asset:'1.svg'}},res);assert.equal(res.code,502);
  } finally {global.fetch=original;}
});
test('proxy accepts a transparently decompressed larger drawing and strips Illustrator editing data',async()=>{
  const original=global.fetch;
  try {
    const source=svg.replace('</svg>','<i:aipgf xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/"><![CDATA['+'A'.repeat(1100000)+']]></i:aipgf></svg>');
    global.fetch=async()=>new Response(source);
    const res=response();await haynesImage({method:'GET',query:{asset:'319106279.svgz'}},res);
    assert.equal(res.code,200);assert.equal(res.body.svg,svg);
  } finally {global.fetch=original;}
});
test('both website builds use identical image helper',()=>{
  assert.equal(fs.readFileSync('website/js/vecta-vehicle-image.js','utf8'),helper);
  for(const path of ['public/booking.html','website/booking/index.html']) {
    const html=fs.readFileSync(path,'utf8');assert.match(html,/vecta-vehicle-image\.js/);assert.match(html,/data-registration=/);assert.match(html,/data-colour=/);
  }
});

test('confirmed illustration colour corrections and customer choices are registration-specific',()=>{
  const root=browser(),values=new Map();root.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const helper=root.VectaVehicleImage;
  assert.equal(helper.resolveColour('BD53 MUD','Red'),'Black');
  assert.equal(helper.resolveColour('CM14 KEL','Green'),'Green');
  helper.rememberColour('BD53 MUD','Blue');
  assert.equal(helper.resolveColour('BD53MUD','Red'),'Blue');
  assert.equal(helper.resolveColour('CM14KEL','Green'),'Green');
  helper.rememberColour('BD53MUD','invalid');
  assert.equal(helper.resolveColour('BD53MUD','Red'),'Blue');
});

test('measured supplier profiles keep registrations on the front of all 13 audited drawings',()=>{
  const profiles=JSON.parse(fs.readFileSync('tests/fixtures/vehicle-drawing-profiles.json','utf8'));
  assert.equal(profiles.length,13);
  for(const profile of profiles) {
    const root=browser();
    root.document.defaultView.Element.prototype.getBBox=function(){return profile.boxes[this.id]||{x:0,y:0,width:0,height:0};};
    const r=root.VectaVehicleImage.personaliseSvg(svg,'AB12CDE','Blue',profile.asset);
    const doc=new DOMParser().parseFromString(r.svg,'image/svg+xml');
    const transform=doc.querySelector('#vecta-front-registration').getAttribute('transform');
    const [x,y]=transform.match(/translate\(([^ ]+) ([^)]+)\)/).slice(1).map(Number);
    const body=profile.boxes.transparant_colour||profile.boxes.transparent_colour;
    assert.ok(x>=body.x&&x<body.x+body.width*.25,profile.model+' plate must be on front, not side');
    assert.ok(y>body.y+body.height*.55&&y<body.y+body.height,profile.model+' plate must be below windscreen');
    assert.equal(doc.querySelector('#vecta-front-registration text').textContent,'AB12 CDE');
    assert.equal(r.recoloured,true);assert.equal(r.plateAdded,true);
  }
});


test('Defender Adobe entity references remain parseable while unsafe metadata is removed',()=>{
  const root=browser();
  const drawing=svg.replace('<svg ', '<svg xmlns:i="&ns_ai;" ').replace('<g id="wheels">','<switch><foreignObject requiredExtensions="&ns_ai;"><i:aipgfRef/></foreignObject><g i:extraneous="self"><g id="wheels">').replace('</svg>','</g></switch></svg>');
  let parsed='';const Parser=root.DOMParser;root.DOMParser=class extends Parser {parseFromString(source,type){parsed=source;return super.parseFromString(source,type);}};
  const r=root.VectaVehicleImage.personaliseSvg(drawing,'M123WPC',root.VectaVehicleImage.resolveColour('M123WPC','Grey'),'319051761.svgz');
  assert.match(parsed,/xmlns:i="urn:vecta-supplier:ai"/);assert.doesNotMatch(parsed,/&ns_ai;/);
  assert.equal(r.recoloured,true);assert.equal(r.plateAdded,true);assert.equal(root.VectaVehicleImage.resolveColour('M123WPC','Grey'),'Grey');assert.match(r.svg,/#626970/);assert.match(r.svg,/M123WPC/);
  assert.doesNotMatch(r.svg,/foreignObject|aipgfRef|extraneous|script|onload/);
});
