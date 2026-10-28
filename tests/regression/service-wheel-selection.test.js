import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML,DOMParser} from 'linkedom';
const booking=fs.readFileSync('website/booking/index.html','utf8');
const code=booking.slice(booking.indexOf('let serviceHeadlightSvgSequence=0;'),booking.indexOf('\nfunction serviceOptionsHtml()'));
test('only selected ready cars illuminate pale headlight lenses; wheels and other lamps stay intact',()=>{
 const {document}=parseHTML('<html><body><div class="service-option selected"><span class="service-vehicle-stage"><img data-service-car data-vehicle-ready="1"></span></div><div class="service-option"><img data-service-car data-vehicle-ready="1"></div></body></html>');
 const originalCreate=document.createElementNS.bind(document);document.createElementNS=(ns,tag)=>originalCreate(ns,tag);
 class Parser extends DOMParser{parseFromString(...args){const doc=super.parseFromString(...args);for(const n of [doc.documentElement,...doc.querySelectorAll('*')]){n.getBBox=()=>n.localName==='svg'?({x:10,y:30,width:100,height:50}):({x:n.getAttribute('id')==='alternate-head'?55:28,y:48,width:4,height:6});n.getCTM=()=>({inverse(){return this},multiply(){return this}});}doc.documentElement.createSVGPoint=()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}});return doc;}}
 const artwork='<svg xmlns="http://www.w3.org/2000/svg"><g id="wheels"><path fill="#aaa" d="M0 0h10v10z"/></g><g id="lights"><path id="head" fill="#F7F7D1"/><path id="alternate-head" fill="#F6F6D2"/><path id="tail" fill="#FF0000"/><path id="indicator" fill="#FF6633"/></g></svg>';
 const imgs=[...document.querySelectorAll('img')];imgs.forEach(img=>img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(artwork));
 vm.runInNewContext(code+'\nilluminateServiceCarHeadlights();illuminateServiceCarHeadlights();',{document,DOMParser:Parser,console});
 const svg=document.querySelector('.service-animated-artwork');
 assert.ok(svg);assert.equal(document.querySelectorAll('.service-animated-artwork').length,1);
 assert.equal(svg.querySelector('.service-headlight-on').getAttribute('fill'),'#ffffff');
 assert.equal(svg.querySelectorAll('.service-headlight-on').length,2,'both supplier lens palettes illuminate');
 assert.equal(svg.querySelector('[id$="tail"]').getAttribute('fill'),'#FF0000');
 assert.equal(svg.querySelector('[id$="indicator"]').getAttribute('fill'),'#FF6633');
 assert.equal(svg.querySelector('[id$="wheels"] path').getAttribute('d'),'M0 0h10v10z');
 assert.equal(svg.querySelector('animateTransform'),null);
 assert.equal(svg.querySelectorAll('.service-headlight-beams path').length,2);
 assert.match(svg.querySelector('.service-headlight-beams path').getAttribute('d'),/M30 50 L10 48/);
 assert.ok(svg.querySelector('[id$="service-headlight-beam"]'));
 assert.equal(svg.querySelectorAll('.service-headlight-beams').length,1);
 assert.equal(imgs[1].dataset.serviceAnimated,undefined);
});
test('booking copies match and reduced motion keeps steady headlights',()=>{
 assert.equal(booking,fs.readFileSync('public/booking.html','utf8'));
 assert.match(booking,/@media\(prefers-reduced-motion:reduce\)\{\.service-headlight-beams\{animation:none\}/);
 assert.doesNotMatch(booking,/service-inspection-sweep|animateServiceCarWheels|animateTransform/);
});

test('actual G4 WPC modern Defender neutral lamp gradients are recognised; red gradients are excluded',()=>{
 const {document}=parseHTML('<svg><radialGradient id="SVGID_38_"><stop stop-color="#CFD2D8"/><stop stop-color="#68696C"/></radialGradient><linearGradient id="rear"><stop stop-color="#FF0000"/><stop stop-color="#880000"/></linearGradient><path id="head" fill="url(#SVGID_38_)"/><path id="tail" fill="url(#rear)"/></svg>');
 const start=code.indexOf('   function isHeadlightLens(node){'),end=code.indexOf('   const candidates=',start);
 const detect=vm.runInNewContext(code.slice(start,end)+'\nisHeadlightLens;',{svg:document});
 assert.equal(detect(document.querySelector('#head')),true);
 assert.equal(detect(document.querySelector('#tail')),false);
});
