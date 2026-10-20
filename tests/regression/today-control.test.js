import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const html=readFileSync('index.html','utf8');
test('Today is available and its existing handler returns a past planner date to today',()=>{
 const {document}=parseHTML(html);const button=document.getElementById('todayBtn');assert.equal(button.hasAttribute('hidden'),false);assert.equal(button.getAttribute('aria-label'),'Go to today');
 let renders=0;const c={document,selectedDate:new Date('2026-01-01T12:00:00Z'),selectedIso:()=> '2026-01-01',plannerShowFullDay:true,render:()=>renders++,bindPlannerGlobalSearch(){},installFinancialInvoiceNavigation(){},installNewJobAvailabilityCalendar(){}};
 vm.runInNewContext(html.match(/function bindTop\(\)\{[^\n]+/)[0],c);c.bindTop();button.onclick();const today=new Date();assert.equal(c.selectedDate.getFullYear(),today.getFullYear());assert.equal(c.selectedDate.getMonth(),today.getMonth());assert.equal(c.selectedDate.getDate(),today.getDate());assert.equal(c.plannerShowFullDay,false);assert.equal(renders,1);
});

// Check all styles in document order: a later !important rule previously hid
// Today even though its markup and click handler passed their tests.
function screenDeclarations(document,element,width){
 const declarations={};let order=0;
 const active=media=>!(/\bprint\b/.test(media))&&[...media.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].every(([,bound,value])=>bound==='min'?width>=Number(value):width<=Number(value));
 function visit(rules){for(const rule of rules){if(rule.cssRules){if(!rule.media||active(rule.media.mediaText))visit(rule.cssRules);continue;}if(!rule.selectorText)continue;
  for(const selector of rule.selectorText.split(',')){let matches=false;try{matches=element.matches(selector)}catch{}if(!matches)continue;
   const specificity=(selector.match(/#[\w-]+/g)||[]).length*100+(selector.match(/\.[\w-]+|\[[^\]]+\]/g)||[]).length*10;
   for(let i=0;i<rule.style.length;i++){const property=rule.style[i],rank=[rule.style.getPropertyPriority(property)==='important'?1:0,specificity,order++],previous=declarations[property];if(!previous||rank[0]>previous.rank[0]||rank[0]===previous.rank[0]&&(rank[1]>previous.rank[1]||rank[1]===previous.rank[1]&&rank[2]>previous.rank[2]))declarations[property]={value:rule.style.getPropertyValue(property),rank};}
  }
 }}
 for(const style of document.querySelectorAll('style'))visit(style.sheet.cssRules);return declarations;
}
for(const width of [390,768,1024,1200,1440])test(`Today wins the complete CSS cascade and sits between date and total at ${width}px`,()=>{
 const {document}=parseHTML(html),top=document.querySelector('.top');const actions=document.createElement('div');actions.className='plannerHeaderActions';top.appendChild(actions);
 const button=screenDeclarations(document,document.getElementById('todayBtn'),width);assert.equal(button.display.value,'flex');assert.equal(button['grid-area'].value,'today');
 const grid=screenDeclarations(document,top,width)['grid-template-areas'].value;const row=grid.split('"').find(row=>row.split(/\s+/).includes('today'));const areas=row.trim().split(/\s+/);assert.ok(areas.lastIndexOf('date')<areas.indexOf('today'));assert.ok(areas.lastIndexOf('today')<areas.indexOf('booked'));
});
