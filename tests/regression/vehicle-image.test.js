import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { parseHTML, DOMParser } from 'linkedom';
import haynesImage from '../../lib/haynes-image.js';
const helper = fs.readFileSync('public/js/vecta-vehicle-image.js','utf8');
function browser(storage) {
  const {document,window} = parseHTML('<html><body></body></html>');
  window.Element.prototype.getBBox = function() { return this.id==='windows' ? {x:90,y:62,width:167,height:36} : {x:26,y:59,width:247,height:110}; };
  const root = {document,DOMParser,XMLSerializer:class {serializeToString(node){return node.outerHTML;}},AbortSignal,console,setTimeout,clearTimeout,localStorage:storage};
  root.window=root;vm.createContext(root);vm.runInContext(helper,root);return root;
}
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 299 220" onload="alert(1)"><script>alert(1)</script><g id="wheels"><path fill="#333333" d="M0 0"/></g><g id="transparant_colour"><path opacity="0.7" fill="#CCCCCC" d="M0 0"/><path fill="none" stroke="#000000" d="M0 0"/></g><g id="windows"><path fill="#222222" d="M0 0"/></g><foreignObject><iframe src="https://evil.example"/></foreignObject><image href="https://evil.example"/><path style="fill:url(https://evil.example)" d="M0 0"/></svg>';
test('rendered colour and plate survive offline browser reopening without fetching the supplier',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 let calls=0,firstUrl;
 for(let reopen=0;reopen<2;reopen++){
  const root=browser(storage);root.fetch=async()=>{calls++;if(reopen)throw Error('offline');return {ok:true,json:async()=>({svg})};};
  root.document.body.innerHTML='<img data-vehicle-image data-registration="YB11DCE" data-colour="Red" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
  await root.VectaVehicleImage.mount();await new Promise(r=>setTimeout(r,550));const img=root.document.querySelector('img');
  assert.match(img.src,/^data:image\/svg\+xml/);assert.match(decodeURIComponent(img.src),/YB11 DCE/);assert.match(decodeURIComponent(img.src),/#ac1727/);
  if(!reopen)firstUrl=img.src;else assert.equal(img.src,firstUrl);
 }
 assert.equal(calls,1);
});
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
  const logos=fs.readdirSync('public/assets/manufacturers').filter(name=>name.endsWith('.svg'));assert.equal(logos.length,30);
  for(const name of logos)assert.equal(fs.readFileSync('website/assets/manufacturers/'+name,'utf8').match(/href="([^"]+)"/)[1],fs.readFileSync('public/assets/manufacturers/'+name,'utf8').match(/href="([^"]+)"/)[1],name+' retains identical original artwork in both builds');
  for(const path of ['public/booking.html','website/booking/index.html']) {
    const html=fs.readFileSync(path,'utf8');assert.match(html,/vecta-vehicle-image\.js/);assert.match(html,/data-registration=/);assert.match(html,/data-colour=/);
  }
});

test('confirmed illustration colour corrections and customer choices are registration-specific',()=>{
  const root=browser(),values=new Map();root.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const helper=root.VectaVehicleImage;
  assert.equal(helper.resolveColour('BD53 MUD','Red'),'Black');
  assert.equal(helper.resolveColour('CM14 KEL','Green'),'Green');
  assert.equal(helper.resolveColour('NJ17 GWM','Silver'),'Blue');
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

test('concurrent copies share the supplier download and personalised render',async()=>{
 let calls=0,writes=0,complete;const root=browser({getItem:()=>null,setItem:()=>writes++});
 root.fetch=async()=>{calls++;await new Promise(r=>complete=r);return {ok:true,json:async()=>({svg})};};
 root.document.body.innerHTML=Array.from({length:5},()=>'<div><img data-vehicle-image data-registration="YB11DCE" data-colour="Red" src="https://www.haynespro-assets.com/workshop/images/123.svgz"></div>').join('');
 const tasks=[...root.document.querySelectorAll('div')].map(scope=>root.VectaVehicleImage.mount(scope));
 await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);complete();await Promise.all(tasks);await new Promise(r=>setTimeout(r,550));
 assert.equal(writes,1,'one personalised render is persisted for all copies');
 assert.equal(new Set([...root.document.querySelectorAll('img')].map(img=>img.src)).size,1);
});

test('manufacturer identification handles aliases and accents without guessing unknown makes',()=>{
 const {manufacturer}=browser().VectaVehicleImage;
 for(const [name,slug] of [['Mercedes-Benz Sprinter','mercedes-benz'],['VW Golf','volkswagen'],['Citroën C3','citroen'],['Land Rover Defender','land-rover'],['Nissan Qashqai','nissan'],['Qashqai',''],['Fordson','']])assert.equal(manufacturer(name),slug);
});
test('manufacturer artwork shares one download and render across cards and survives offline reopening',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 let supplier=0,logos=0,first;
 for(let reopen=0;reopen<2;reopen++){
  const root=browser(storage);root.fetch=async url=>{assert.equal(reopen,0,'cached branded artwork needs no network');if(url.startsWith('/assets/')){logos++;assert.equal(url,'/assets/manufacturers/ford.svg');return {ok:true,text:async()=>fs.readFileSync('public/assets/manufacturers/ford.svg','utf8')};}supplier++;return {ok:true,json:async()=>({svg})};};
  root.document.body.innerHTML=Array.from({length:4},()=>'<div><img data-vehicle-image data-vehicle-name="Ford Transit" data-registration="YB11DCE" data-colour="Red" src="https://www.haynespro-assets.com/workshop/images/123.svgz"></div>').join('');
  await Promise.all([...root.document.querySelectorAll('div')].map(scope=>root.VectaVehicleImage.mount(scope)));await new Promise(r=>setTimeout(r,550));
  const urls=[...root.document.querySelectorAll('img')].map(img=>img.src);assert.equal(new Set(urls).size,1);
  const doc=new DOMParser().parseFromString(decodeURIComponent(urls[0].split(',').slice(1).join(',')),'image/svg+xml');
  const mark=doc.querySelector('#vecta-manufacturer-logo image');assert.match(mark.getAttribute('href'),/^data:image\/png;base64,/);
  assert.equal(doc.querySelector('#transparant_colour path').getAttribute('fill'),'#ac1727');
  const badge=doc.querySelector('#vecta-manufacturer-logo rect');
  assert.ok(Number(badge.getAttribute('y'))>=220,'badge sits beneath the car drawing');
  assert.ok(Number(badge.getAttribute('width'))>299*.3,'badge is substantially larger');
  assert.equal(Number(badge.getAttribute('x'))+Number(badge.getAttribute('width'))/2,299/2,'badge is centred');
  assert.ok(Number(doc.documentElement.getAttribute('viewBox').split(' ')[3])>=Number(badge.getAttribute('y'))+Number(badge.getAttribute('height')),'badge is not clipped');
  if(!reopen)first=urls[0];else assert.equal(urls[0],first);
 }
 assert.equal(logos,1);assert.equal(supplier,1);
});
test('unavailable logo retains vehicle artwork and an independent later card retries',async()=>{
 const root=browser();let logos=0;
 root.fetch=async url=>url.startsWith('/assets/')?(logos++,{ok:false}):{ok:true,json:async()=>({svg})};
 for(let i=0;i<2;i++){
  root.document.body.innerHTML='<img data-vehicle-image data-vehicle-make="Nissan" data-registration="YB11DCE" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
  await root.VectaVehicleImage.mount();assert.match(root.document.querySelector('img').src,/^data:image\/svg/);assert.doesNotMatch(decodeURIComponent(root.document.querySelector('img').src),/vecta-manufacturer-logo/);
 }
 assert.equal(logos,2);
});

test('separate website badge does not remain embedded under the car',async()=>{
 const root=browser();let calls=0;root.fetch=async url=>{calls++;assert.ok(url.startsWith('/api/haynes-image'));return {ok:true,json:async()=>({svg})};};
 root.document.body.innerHTML='<img data-vehicle-image data-vehicle-logo="separate" data-vehicle-name="Ford Transit" data-registration="YB11DCE" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
 await root.VectaVehicleImage.mount();assert.equal(calls,1);assert.doesNotMatch(decodeURIComponent(root.document.querySelector('img').src),/vecta-manufacturer-logo/);
});

test('Fleet crop removes empty supplier canvas and uses a separate persisted render',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 let calls=0;
 for(let reopen=0;reopen<2;reopen++){
  const root=browser(storage);root.fetch=async()=>{calls++;assert.equal(reopen,0);return {ok:true,json:async()=>({svg})};};
  root.document.body.innerHTML='<img data-vehicle-image data-vehicle-logo="separate" data-registration="NK75BBX" src="https://www.haynespro-assets.com/workshop/images/123.svgz"><img data-vehicle-image data-vehicle-logo="separate" data-vehicle-crop="tight" data-registration="NK75BBX" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
  await root.VectaVehicleImage.mount();await new Promise(r=>setTimeout(r,550));
  const [normal,cropped]=[...root.document.querySelectorAll('img')].map(img=>new DOMParser().parseFromString(decodeURIComponent(img.src.split(',').slice(1).join(',')),'image/svg+xml'));
  assert.equal(normal.documentElement.getAttribute('viewBox'),'0 0 299 220');
  const [x,y,w,h]=cropped.documentElement.getAttribute('viewBox').split(' ').map(Number);
  assert.ok(y>50,'empty top canvas removed');
  assert.ok(x<26&&y<59&&x+w>273&&y+h>169,'complete drawing retained with padding');
  assert.equal(Number(cropped.documentElement.getAttribute('width')),w);
  assert.equal(Number(cropped.documentElement.getAttribute('height')),h);
  assert.equal(cropped.documentElement.getAttribute('preserveAspectRatio'),'xMaxYMin meet');
  assert.equal(cropped.querySelector('#vecta-front-registration text').textContent,'NK75 BBX');
 }
 assert.equal(calls,1,'normal and crop share source and both reopen offline');
});

test('panel van windows cannot move the registration onto the side of the body',()=>{
 const root=browser();
 root.document.defaultView.Element.prototype.getBBox=function(){return this.id==='windows'?{x:35,y:20,width:110,height:85}:{x:10,y:10,width:270,height:180};};
 const result=root.VectaVehicleImage.personaliseSvg(svg,'NJ16VME','White','999.svgz','',false,'Nissan NV400');
 const doc=new DOMParser().parseFromString(result.svg,'image/svg+xml'),plate=doc.querySelector('#vecta-front-registration');
 const [x]=plate.getAttribute('transform').match(/translate\(([^ ]+)/).slice(1).map(Number);
 assert.ok(x<10+270*.2,'plate stays on front bumper instead of the rear side panel');
 assert.ok(Number(plate.querySelector('rect').getAttribute('width'))<270*.15,'van plate fits its narrower front face');
 assert.equal(plate.querySelector('text').textContent,'NJ16 VME');
});

test('tight artwork crop ignores oversized root canvas and retains the wheels',()=>{
 const root=browser();
 root.document.defaultView.Element.prototype.getBBox=function(){
  if(this.id==='transparant_colour')return {x:40,y:60,width:250,height:120};
  if(this.id==='windows')return {x:80,y:65,width:160,height:35};
  if(this.id==='wheels')return {x:45,y:150,width:240,height:65};
  return this.localName==='svg'?{x:0,y:0,width:1000,height:1000}:{x:0,y:0,width:0,height:0};
 };
 const result=root.VectaVehicleImage.personaliseSvg(svg.replace('0 0 299 220','0 0 1000 1000'),'GH15JJY','Gold','999.svgz','',true,'Land Rover Range Rover');
 const doc=new DOMParser().parseFromString(result.svg,'image/svg+xml');
 const [x,y,w,h]=doc.documentElement.getAttribute('viewBox').split(' ').map(Number);
 assert.ok(w<300&&h<200,'vehicle fills the image box instead of retaining spare canvas');
 assert.ok(x<40&&y<60&&x+w>290&&y+h>215,'body, wheels and padding remain visible');
});

test('corrected drawing geometry has a fresh cache key so old misplaced plates are not reused',async()=>{
 const old=encodeURIComponent('<svg><text>OLD SIDE PLATE</text></svg>'),values=new Map([['vecta_vehicle_rendered_artwork_v1',JSON.stringify([['123.svgz|NJ16VME|#f5f5f2|tight-v1',{url:'data:image/svg+xml;charset=utf-8,'+old,plateAdded:true,recoloured:true}]])]]);
 const root=browser({getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)});let calls=0;
 root.fetch=async()=>{calls++;return {ok:true,json:async()=>({svg})};};
 root.document.body.innerHTML='<img data-vehicle-image data-vehicle-logo="separate" data-vehicle-crop="tight" data-vehicle-name="Nissan NV400" data-colour="White" data-registration="NJ16VME" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
 await root.VectaVehicleImage.mount();assert.equal(calls,1);assert.doesNotMatch(decodeURIComponent(root.document.querySelector('img').src),/OLD SIDE PLATE/);
});

test('an oversized supplier shadow cannot shrink a Range Rover body inside its crop',()=>{
 const root=browser();
 root.document.defaultView.Element.prototype.getBBox=function(){
  if(this.id==='transparant_colour')return {x:40,y:60,width:250,height:120};
  if(this.id==='windows')return {x:80,y:65,width:160,height:35};
  if(this.id==='wheels')return {x:45,y:150,width:240,height:65};
  if(this.id==='shadow')return {x:-200,y:0,width:900,height:500};
  return {x:0,y:0,width:0,height:0};
 };
 const result=root.VectaVehicleImage.personaliseSvg(svg.replace('<g id="wheels">','<g id="shadow"><path d="M0 0"/></g><g id="wheels">'),'GH15JJY','Gold','999.svgz','',true,'Land Rover Range Rover Sport');
 const doc=new DOMParser().parseFromString(result.svg,'image/svg+xml'),[x,y,w,h]=doc.documentElement.getAttribute('viewBox').split(' ').map(Number);
 assert.ok(w<300&&h<200);assert.ok(x<40&&y<60&&x+w>290&&y+h>215);
});

function artworkStorage(){
 const rows=new Map();
 return {rows,open(){const request={};setTimeout(()=>{request.result={close(){},transaction(){const tx={};const store={get(key){const r={};queueMicrotask(()=>{r.result=rows.get(key);r.onsuccess?.()});return r},put(row){rows.set(row.key,structuredClone(row));setTimeout(()=>tx.oncomplete?.(),0)},count(){const r={};queueMicrotask(()=>{r.result=rows.size;r.onsuccess?.()});return r},openCursor(){const r={},keys=[...rows.keys()].sort();let index=0;const next=()=>queueMicrotask(()=>{const key=keys[index++];r.result=key===undefined?null:{key,delete:()=>rows.delete(key),continue:next};r.onsuccess?.()});next();return r}};tx.objectStore=()=>store;return tx}};request.onsuccess?.()},0);return request}};
}
test('a fleet larger than the memory cache survives reopening with zero image downloads',async()=>{
 const indexedDB=artworkStorage();let downloads=0,writes=0;
 const storage={getItem:()=>null,setItem:()=>writes++};
 for(let reopen=0;reopen<2;reopen++){
  const root=browser(storage);root.indexedDB=indexedDB;
  root.fetch=async()=>{downloads++;if(reopen)throw Error('offline');return{ok:true,json:async()=>({svg})}};
  root.document.body.innerHTML=Array.from({length:140},(_,i)=>'<img data-vehicle-image data-vehicle-logo="separate" data-registration="TEST'+i+'" data-colour="Red" src="https://www.haynespro-assets.com/workshop/images/123.svgz">').join('');
  await root.VectaVehicleImage.mount();await new Promise(r=>setTimeout(r,10));
  for(const img of root.document.querySelectorAll('img')){assert.match(img.src,/^data:image\/svg/);assert.match(decodeURIComponent(img.src),/#ac1727/)}
 }
 assert.equal(downloads,1);assert.equal(writes,0,'IndexedDB avoids synchronous fleet cache rewrites');assert.equal(indexedDB.rows.size,141);
});
test('stored supplier artwork recolours a vehicle offline without downloading again',async()=>{
 const indexedDB=artworkStorage();let downloads=0;
 for(const colour of ['Red','Blue']){
  const root=browser();root.indexedDB=indexedDB;root.fetch=async()=>{downloads++;if(colour==='Blue')throw Error('offline');return{ok:true,json:async()=>({svg})}};
  root.document.body.innerHTML='<img data-vehicle-image data-vehicle-logo="separate" data-registration="AB12CDE" data-colour="'+colour+'" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
  await root.VectaVehicleImage.mount();await new Promise(r=>setTimeout(r,10));assert.match(decodeURIComponent(root.document.querySelector('img').src),new RegExp(colour==='Blue'?'#235b9a':'#ac1727'));
 }
 assert.equal(downloads,1);
});

test('branded fleet beyond the memory cache reopens without downloading badges or supplier artwork',async()=>{
 const indexedDB=artworkStorage();let supplier=0,logos=0;
 for(let reopen=0;reopen<2;reopen++){
  const root=browser();root.indexedDB=indexedDB;
  root.fetch=async url=>{
   assert.equal(reopen,0,'persistent completed render must be checked before downloading its badge');
   if(url.startsWith('/assets/')){logos++;return {ok:true,text:async()=>fs.readFileSync('public/assets/manufacturers/ford.svg','utf8')};}
   supplier++;return {ok:true,json:async()=>({svg})};
  };
  root.document.body.innerHTML=Array.from({length:140},(_,i)=>'<img data-vehicle-image data-vehicle-name="Ford Transit" data-registration="TEST'+i+'" data-colour="Red" src="https://www.haynespro-assets.com/workshop/images/123.svgz">').join('');
  await root.VectaVehicleImage.mount();await new Promise(r=>setTimeout(r,10));
  for(const img of root.document.querySelectorAll('img'))assert.match(decodeURIComponent(img.src),/vecta-manufacturer-logo/);
 }
 assert.equal(supplier,1);assert.equal(logos,1);
});

test('supplier sources remain permanent when the fleet exceeds the render storage limit',async()=>{
 const indexedDB=artworkStorage();
 for(let i=0;i<513;i++)indexedDB.rows.set('source:'+i+'.svgz',{key:'source:'+i+'.svgz',value:svg});
 for(let i=0;i<3;i++)indexedDB.rows.set('render:old'+i,{key:'render:old'+i,value:{url:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}});
 const root=browser();root.indexedDB=indexedDB;let calls=0;
 root.fetch=async()=>{calls++;throw Error('cached supplier source must survive');};
 root.document.body.innerHTML='<img data-vehicle-image data-vehicle-logo="separate" data-registration="AB12CDE" data-colour="Blue" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
 await root.VectaVehicleImage.mount();await new Promise(r=>setTimeout(r,10));
 assert.equal(calls,0);assert.match(decodeURIComponent(root.document.querySelector('img').src),/#235b9a/);
 assert.equal([...indexedDB.rows.keys()].filter(key=>key.startsWith('source:')).length,513);
 assert.equal([...indexedDB.rows.keys()].filter(key=>key.startsWith('render:old')).length,0,'old rendered variants may be regenerated without downloads');
});


test('placeholder recovers after a failed supplier request without an image error',async()=>{
 const root=browser(),timers=[];let calls=0;
 root.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};
 root.clearTimeout=()=>{};
 root.fetch=async()=>{if(++calls===1)throw Error('temporary failure');return {ok:true,json:async()=>({svg})};};
 root.document.body.innerHTML='<img data-vehicle-image data-vehicle-logo="separate" data-registration="MTC2" data-colour="Grey" data-vehicle-source="https://www.haynespro-assets.com/workshop/images/123.svgz" src="data:image/svg+xml;charset=utf-8,placeholder">';
 await root.VectaVehicleImage.mount();
 assert.equal(timers.length,1);assert.equal(timers[0].delay,1500);
 timers.shift().fn();
 for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
 assert.match(decodeURIComponent(root.document.querySelector('img').src),/MTC2/);
 assert.equal(calls,2);
});

test('supplier failure retries at most twice and stops for disconnected cards',async()=>{
 const root=browser(),timers=[];let calls=0;
 root.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};root.clearTimeout=()=>{};
 root.fetch=async()=>{calls++;throw Error('offline');};
 root.document.body.innerHTML='<img data-vehicle-image data-vehicle-logo="separate" src="https://www.haynespro-assets.com/workshop/images/123.svgz">';
 await root.VectaVehicleImage.mount();
 for(let i=0;i<2;i++){assert.equal(timers.length,1);timers.shift().fn();for(let n=0;n<10;n++)await new Promise(r=>setImmediate(r));}
 assert.equal(calls,3);assert.equal(timers.length,0);
});

test('supplier drawings above 500 KB still render colour and front registration',async()=>{
 const root=browser();
 const largeSvg=svg.replace('</svg>','<!--'+'.'.repeat(820000)+'--></svg>');
 assert.ok(largeSvg.length>500000&&largeSvg.length<2000000);
 root.fetch=async()=>({ok:true,json:async()=>({svg:largeSvg})});
 root.document.body.innerHTML='<img data-vehicle-image data-registration="CM14KEL" data-colour="Green" data-vehicle-logo="separate" src="https://www.haynespro-assets.com/workshop/images/319106279.svgz">';
 await root.VectaVehicleImage.mount();
 const img=root.document.querySelector('img');
 assert.equal(img.dataset.recoloured,'true');assert.equal(img.dataset.personalised,'true');
 assert.match(decodeURIComponent(img.src),/#296145/);assert.match(decodeURIComponent(img.src),/CM14 KEL/);
});
