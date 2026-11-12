import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

test('customer history shows five newest entries, pages backwards and keeps the exhausted cursor across refreshes',async()=>{
 const {document}=parseHTML(readFileSync('public/track.html','utf8'));document.hidden=false;
 const event=i=>({id:'event-'+i,seq:i,actor:'workshop',kind:'message',created_at:'2026-11-11T12:00:00Z',message:'Update '+i});
 const data={booking:{registration:'TEST001',booking_date:'2026-11-12',can_message:true},approvals:[],events:Array.from({length:8},(_,i)=>event(i+3)),older_cursor:'3',original:{created_at:'2026-11-01T12:00:00Z',booking_date:'2026-11-12',work_required:'MOT'}};
 const requests=[],window={addEventListener(){}};
 vm.runInNewContext(readFileSync('public/js/vecta-customer-portal.js','utf8'),{document,window,location:{hash:'#fixture',search:''},Intl,Date,URLSearchParams,AbortSignal,clearTimeout(){},setTimeout(){},fetch:async(url,{body})=>{const request=JSON.parse(body);requests.push(request);return {ok:true,json:async()=>request.before?{events:[event(1),event(2)],older_cursor:null}:data};}});
 await new Promise(r=>setImmediate(r));
 const ids=()=>[...document.querySelectorAll('.portalEvent')].map(c=>c.dataset.eventId),more=document.getElementById('portalOlder');
 assert.deepEqual(ids(),['event-10','event-9','event-8','event-7','event-6']);
 const original=document.querySelector('.portalOriginal');assert.equal(original.tagName,'DETAILS');assert.equal(original.hasAttribute('open'),false);
 assert.ok(document.getElementById('portalConversation').textContent.indexOf('Update 10')<document.getElementById('portalConversation').textContent.indexOf('Original booking'));
 await more.onclick();assert.equal(ids().length,8);assert.equal(requests.length,1);
 await more.onclick();assert.equal(ids().length,10);assert.equal(more.hidden,true);assert.equal(requests.at(-1).before,'3');
 data.events.push(event(11));await window.VectaCustomerPortal.refresh();assert.equal(ids().length,11);assert.equal(ids()[0],'event-11');assert.equal(ids().at(-1),'event-1');assert.equal(more.hidden,true);
 await window.VectaCustomerPortal.refresh();assert.equal(ids().length,11);assert.equal(more.hidden,true,'polling must not restore the already exhausted earlier-page cursor');
 assert.equal(document.getElementById('portalReply').hidden,false);data.booking.can_message=false;await window.VectaCustomerPortal.refresh();assert.equal(document.getElementById('portalReply').hidden,true);
});
