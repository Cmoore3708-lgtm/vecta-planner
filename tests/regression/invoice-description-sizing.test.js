import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

const main=readFileSync('index.html','utf8');
function setup(source){
  const frames=[];
  let fields=[];
  const context={
    window:{innerWidth:390,requestAnimationFrame:callback=>frames.push(callback)},
    document:{querySelectorAll:()=>fields},
    ResizeObserver:class {constructor(){throw Error('Invoice sizing must not observe its own layout');}}
  };
  vm.createContext(context);
  for(const name of ['fitPrivatePricingDescription','schedulePrivatePricingFit','privatePricingViewportResize']){
    const start=source.indexOf('function '+name+'(');
    assert.ok(start>=0,name);
    vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+1)),context);
  }
  return {context,frames,setFields:value=>fields=value};
}
function field(height=100){return {clientWidth:320,scrollHeight:height,offsetHeight:74,clientHeight:72,style:{height:'74px'}};}

for(const [variant,source] of [['Main',main],['mechanics',mechanicVariant(main)]]){
  test(variant+': saved and edited descriptions grow and shrink to include every line',()=>{
    const {context}=setup(source),description=field();
    context.fitPrivatePricingDescription(description);assert.equal(description.style.height,'102px');
    description.scrollHeight=220;context.fitPrivatePricingDescription(description);assert.equal(description.style.height,'222px');
    description.scrollHeight=72;context.fitPrivatePricingDescription(description);assert.equal(description.style.height,'74px');
    description.clientWidth=0;description.scrollHeight=0;context.fitPrivatePricingDescription(description);assert.equal(description.style.height,'74px');
  });

  test(variant+': repeated layout requests settle after one frame and use the currently open editor',()=>{
    const {context,frames,setFields}=setup(source),closed=field(120),opened=field(200);
    setFields([closed]);context.schedulePrivatePricingFit();context.schedulePrivatePricingFit();
    assert.equal(frames.length,1);assert.equal(closed.style.height,'74px');
    setFields([opened]);frames.shift()();
    assert.equal(closed.style.height,'74px');assert.equal(opened.style.height,'202px');
    assert.equal(frames.length,0,'fitting must not create another layout callback');
    assert.equal(context.schedulePrivatePricingFit.pending,false);
  });

  test(variant+': rotation refits on the next frame; keyboard-height changes do not refit',()=>{
    const {context,frames,setFields}=setup(source),description=field(160);
    setFields([description]);context.privatePricingViewportResize.width=390;
    context.privatePricingViewportResize();assert.equal(frames.length,0);
    context.window.innerWidth=768;context.privatePricingViewportResize();context.privatePricingViewportResize();
    assert.equal(frames.length,1);assert.equal(description.style.height,'74px');
    frames.shift()();assert.equal(description.style.height,'162px');assert.equal(frames.length,0);
    context.window.innerWidth=320;description.scrollHeight=260;context.privatePricingViewportResize();
    frames.shift()();assert.equal(description.style.height,'262px');assert.equal(frames.length,0);
  });
}
