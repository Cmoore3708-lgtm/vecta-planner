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
