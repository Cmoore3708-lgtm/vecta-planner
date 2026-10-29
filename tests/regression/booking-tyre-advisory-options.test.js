import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync('website/booking/index.html','utf8');
function setup(advisories=['Nearside front tyre worn close to legal limit']){
 const yes={dataset:{advisoryChoice:'yes'}},no={dataset:{advisoryChoice:'no'}},select={dataset:{advisoryTyres:'select'}},workshop={dataset:{advisoryTyres:'workshop'}};
 const state={step:3,form:{mot_advisories:advisories,job_types:['Service'],mileage:'135000',inspect_mot_advisories:''}};
 const ctx={state,esc:String,render(){},document:{querySelector:()=>null,querySelectorAll:s=>s==='[data-advisory-choice]'?[yes,no]:s==='[data-advisory-tyres]'?[select,workshop]:[]}};
 vm.createContext(ctx);
 for(const name of ['hasTyreAdvisory','advisoryQuestionHtml','bindAdvisoryChoices']){
 const start=html.indexOf('function '+name+'(');vm.runInContext(html.slice(start,html.indexOf('\nfunction ',start+1)),ctx);}
 ctx.bindAdvisoryChoices();return {ctx,state,yes,no,select,workshop};
}
test('Yes shows tyre choices only for tyre advisories',()=>{
 const s=setup();s.yes.onclick();assert.match(s.ctx.advisoryQuestionHtml(),/pre-select your tyres/);
 s.workshop.onclick();assert.equal(s.state.form.advisory_tyre_choice,'workshop');assert.equal(s.state.step,3);
 s.no.onclick();assert.equal(s.state.form.advisory_tyre_choice,'');assert.doesNotMatch(s.ctx.advisoryQuestionHtml(),/advisory-tyre-options/);
 const other=setup(['Brake disc worn']);other.yes.onclick();assert.doesNotMatch(other.ctx.advisoryQuestionHtml(),/advisory-tyre-options/);
});
test('preselection returns to work step, enables Tyres once and preserves service and mileage',()=>{
 const s=setup();s.yes.onclick();s.select.onclick();s.select.onclick();
 assert.equal(s.state.step,2);assert.deepEqual(s.state.form.job_types,['Service','Tyres']);assert.equal(s.state.form.mileage,'135000');
});
