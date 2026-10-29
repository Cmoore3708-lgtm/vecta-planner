import test from 'node:test';import assert from 'node:assert/strict';import {oilFillEvidence} from '../../workers/gsf/oil-capacity.mjs';
const capture={registration:'CM14KEL',selectedRegistration:true,visibleText:'CM14KEL Clear Nissan Qashqai e-Power 1.5 Petrol Copy VIN Capacity 1L 5L'};
test('manufacturer fill is kept separate from bottle sizes and requires live exact variant',()=>{
 const result=oilFillEvidence(capture,'CM14KEL');assert.equal(result.requiredMl,5100);assert.equal(result.typeId,'t_619108899');
 for(const c of [{...capture,registration:'OTHER1'},{...capture,selectedRegistration:false},{...capture,truncated:true},{...capture,visibleText:capture.visibleText.replace('e-Power','dCi')},{...capture,visibleText:capture.visibleText.replace('1.5','1.6')},{...capture,visibleText:capture.visibleText.replace('Petrol','Diesel')}])assert.equal(oilFillEvidence(c,'CM14KEL'),null);
});
