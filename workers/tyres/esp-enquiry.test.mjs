import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureEnquiry} from './esp-enquiry.mjs';
function mock({open=false,labelled=true}={}){
 let clicks=0,waits=0;const field={count:async()=>1,isVisible:async()=>open,waitFor:async()=>{waits++}};
 const candidate={filter(){return this},count:async()=>labelled?1:0,click:async()=>{clicks++;open=true}};
 return {page:{locator:s=>s==='#key1'?field:candidate,getByRole:()=>candidate},counts:()=>({clicks,waits})};
}
test('already-visible size fields need no Enquiry click',async()=>{const m=mock({open:true});await ensureEnquiry(m.page);assert.deepEqual(m.counts(),{clicks:0,waits:0});});
test('opens labelled Enquiry then waits for size fields',async()=>{const m=mock();await ensureEnquiry(m.page);assert.deepEqual(m.counts(),{clicks:1,waits:1});});
test('never guesses an unlabelled tab by position',async()=>{const m=mock({labelled:false});await assert.rejects(ensureEnquiry(m.page),/NOT_IDENTIFIED/);assert.equal(m.counts().clicks,0);});
