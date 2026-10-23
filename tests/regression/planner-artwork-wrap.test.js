import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
const source=fs.readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');
const functions=new Map();
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')functions.set(node.id.name,source.slice(node.start,node.end));for(const [key,value]of Object.entries(node))if(key!=='loc'){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'&&value.type)walk(value);}}
walk(parse(source,{sourceType:'script'}));
function polygon(profile,box){const ctx={};vm.runInNewContext(functions.get('plannerArtworkPolygon'),ctx);return ctx.plannerArtworkPolygon(profile,box);}
const profile={width:100,height:5,left:[80,40,10,10,100]};
const geometry={width:100,height:100,scrollTop:0,imageLeft:0,imageTop:20,imageWidth:100,imageHeight:50};
const points=s=>[...s.matchAll(/([\d.]+)px ([\d.]+)px/g)].map(m=>m.slice(1).map(Number));
test('outline follows windscreen/bonnet edges and releases clear space above and below a car',()=>{
 const shape=points(polygon(profile,geometry));
 assert.ok(shape.some(([x,y])=>x===100&&y===0),'clear canvas above the car is usable');
 assert.ok(shape.some(([x,y])=>x===34&&y===22),'windscreen inset uses its painted edge plus clearance');
 assert.ok(shape.some(([x,y])=>x===4&&y===42),'bonnet/body retain a six pixel gap');
 assert.ok(shape.some(([x,y])=>x===100&&y===96),'text can use the full row below the wheels');
 assert.ok(shape.every(([x,y])=>x>=0&&x<=100&&y>=0&&y<=100));
});
test('scrolling anchors the outline to the stationary car and resize scales its silhouette',()=>{
 const base=points(polygon(profile,geometry)),scrolled=points(polygon(profile,{...geometry,scrollTop:30}));
 assert.ok(base.some(([x,y])=>x===4&&y===42));assert.ok(scrolled.some(([x,y])=>x===4&&y===72));
 const resized=points(polygon(profile,{...geometry,imageLeft:20,imageWidth:50}));
 assert.ok(resized.some(([x,y])=>x===19&&y===42));
});
test('offscreen and transparent images cannot produce an invalid or negative exclusion width',()=>{
 for(const imageLeft of [-200,200])assert.ok(points(polygon(profile,{...geometry,imageLeft})).every(([x])=>x>=0&&x<=100));
 const empty=points(polygon({width:100,height:5,left:[100,100,100,100,100]},geometry));assert.ok(empty.every(([x])=>x===100));
});
test('outline sampling is cached per loaded image and an unreadable image fails safely',()=>{
 let reads=0;const canvas={width:0,height:0,getContext:()=>({drawImage(){},getImageData(){reads++;const pixels=new Uint8ClampedArray(canvas.width*canvas.height*4);pixels[3]=10;pixels[7]=255;return {data:pixels};}})};
 const ctx={artworkProfiles:new WeakMap(),document:{createElement:()=>canvas}};vm.runInNewContext(functions.get('plannerArtworkProfile'),ctx);
 const img={src:'data:image/svg+xml,first',naturalWidth:100,naturalHeight:50};
 const first=ctx.plannerArtworkProfile(img);assert.equal(first.left[0],1,'faint shadows are not solid body pixels');
 assert.equal(ctx.plannerArtworkProfile(img),first);assert.equal(reads,1);
 img.src='data:image/svg+xml,replaced';ctx.plannerArtworkProfile(img);assert.equal(reads,2,'a changed image gets a new outline');
 img.src='https://unreadable.example/car.png';canvas.getContext=()=>{throw Error('Cross-origin canvas')};assert.equal(ctx.plannerArtworkProfile(img),null);
});

test('make/model width follows the roof silhouette even when the description is empty',()=>{
 const values=new Map(),style={setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)};
 const card={matches:()=>true,clientWidth:400,style,classList:{remove(){}},querySelector:s=>s==='.plannerJobVehicle'?{getBoundingClientRect:()=>({top:0,bottom:10})}:s==='.plannerJobHeader'?{getBoundingClientRect:()=>({left:10})}:null};
 const img={isConnected:true,naturalWidth:200,naturalHeight:100,getBoundingClientRect:()=>({top:0,right:400,width:200,height:100}),addEventListener(){}};
 const ctx={timedArtwork:new WeakMap(),root:{},plannerArtworkProfile:()=>({width:100,height:5,left:[80,40,10,10,100]})};
 vm.runInNewContext(functions.get('trackTimedArtwork'),ctx);ctx.trackTimedArtwork(card,img);
 assert.equal(values.get('--planner-vehicle-text-inset'),'212px');
 assert.equal(values.get('--planner-identity-text-inset'),'136px','roof clearance leaves extra width for the vehicle name');
});
