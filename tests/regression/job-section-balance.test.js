import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync('public/js/haynes-job-tools.js','utf8');
const start=source.indexOf('function balanceJobSections('),code=source.slice(start,source.indexOf('\nroot.initHaynesJobTools=',start));
function setup(){
 const {document,window}=parseHTML('<div id="modal" aria-hidden="false"><div class="jobCardSections"><div class="jobCardMainColumn"><section class="jobVehicleHistory" data-height="44"></section><section class="jobWorkSection" data-height="400"><textarea id="work">Original instructions</textarea></section><section class="jobFormSection jobInternalNotesSection" data-height="120"><textarea id="notes">Keep this note</textarea></section><section id="parts" data-height="100"><input value="Thermostat"></section><section id="pricing" data-height="120"></section></div><div class="jobCardSupportColumn"><div class="bookingAvailabilityWorkspace" data-height="44"></div></div></div></div>');
 const modal=document.querySelector('#modal'),sections=modal.firstElementChild,main=sections.firstElementChild,aside=sections.lastElementChild,parts=document.querySelector('#parts'),pricing=document.querySelector('#pricing');
 const frames=[];let resize,mutate,active=null,narrow=false;
 document.defaultView.Element.prototype.getBoundingClientRect=function(){if(this===main)return{left:0,right:500,width:500,height:800};if(this===aside)return{left:narrow?0:510,right:narrow?500:1010,width:500,height:600};return{height:Number(this.dataset.height||0),width:500};};
 Object.defineProperty(document,'activeElement',{get:()=>active});
 const root={getComputedStyle:()=>({rowGap:'8px'}),requestAnimationFrame:fn=>(frames.push(fn),frames.length),cancelAnimationFrame(){},ResizeObserver:class{constructor(fn){resize=fn}observe(){}unobserve(){}disconnect(){}},MutationObserver:class{constructor(fn){mutate=fn}observe(){}disconnect(){}}};
 const ctx={root,document};vm.runInNewContext(code,ctx);ctx.balanceJobSections(modal,sections,main,aside,parts,pricing);
 const flush=()=>{let i=0;while(frames.length){assert.ok(i++<10,'layout must settle');frames.shift()()}};
 return{document,window,main,aside,parts,pricing,flush,resize:()=>resize(),mutate:()=>mutate(),focus:el=>{active=el},narrow:()=>{narrow=true}};
}
test('job sections fill both columns, including sections mounted later, with Parts and Invoice always last on the right',()=>{
 const s=setup();s.flush();
 const note=s.document.querySelector('#notes'),partsInput=s.parts.querySelector('input');let changes=0;note.addEventListener('input',()=>changes++);
 const messages=s.document.createElement('section');messages.className='jobFormSection portalWorkshop';messages.dataset.height='230';s.main.append(messages);s.mutate();s.flush();
 assert.ok([...s.aside.children].some(el=>el!==s.parts&&el!==s.pricing&&!el.matches('.bookingAvailabilityWorkspace')),'independent content uses available right-column space');
 assert.deepEqual([...s.aside.children].slice(-2),[s.parts,s.pricing]);
 assert.equal(s.document.querySelector('#notes'),note);assert.equal(s.parts.querySelector('input'),partsInput);
 note.dispatchEvent(new s.window.Event('input'));assert.equal(changes,1);assert.equal(note.value,'Keep this note');
 const before=[...s.aside.children];s.focus(note);s.pricing.dataset.height='900';s.resize();s.flush();assert.deepEqual([...s.aside.children],before,'typing must not move fields or lose the caret');
 s.focus(null);s.resize();s.flush();assert.deepEqual([...s.aside.children].slice(-2),[s.parts,s.pricing]);
 s.narrow();s.resize();s.flush();assert.equal(messages.parentElement,s.main);assert.equal(note.closest('.jobCardMainColumn'),s.main);assert.deepEqual([...s.aside.children].slice(-2),[s.parts,s.pricing]);
});
