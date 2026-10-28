import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../../api/booking-calendar.js';
import websiteHandler from '../../website/api/booking-calendar.js';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}}}
for(const exportHandler of [handler,websiteHandler])test('calendar endpoint sends a valid attachment and rejects malformed input',()=>{
 const r=response();exportHandler({method:'GET',query:{date:'2026-12-31',registration:'AB12 CDE',work:'MOT, Tyres\r\nATTENDEE:evil',id:'booking-id'}},r);
 assert.equal(r.code,200);assert.match(r.headers['Content-Type'],/^text\/calendar/);assert.match(r.headers['Content-Disposition'],/attachment; filename="Vecta-AB12CDE-2026-12-31.ics"/);
 assert.match(r.body,/DTSTART;VALUE=DATE:20261231/);assert.match(r.body,/DTEND;VALUE=DATE:20270101/);assert.match(r.body,/MOT\\, Tyres/);assert.doesNotMatch(r.body,/\r\nATTENDEE:/);
 for(const date of ['2026-02-30','not-a-date',['2026-10-23']]){const bad=response();exportHandler({method:'GET',query:{date}},bad);assert.equal(bad.code,400)}
 const bad=response();exportHandler({method:'POST',query:{}},bad);assert.equal(bad.code,405);
});
test('tyre review retains a matching quote but discards it when size, range or quantity changes',()=>{
 const html=fs.readFileSync('website/booking/index.html','utf8');const quote={checkedAt:new Date().toISOString(),size:'225/40R18',category:'premium',quantity:2,brand:'Michelin',model:'Pilot Sport',unitPence:14000,totalPence:28000};
 const form={job_types:['Tyres'],tyre_size:'225/40R18',tyre_choice:'Premium',tyre_quantity:2,tyre_guide:quote};const c=vm.createContext({state:{form},selectedTyreGuide:()=>null,VectaTyreBooking:{sizeKey:v=>v},esc:String,tyreMoney:p=>'£'+p/100});
 vm.runInContext(html.slice(html.indexOf('function savedTyreGuide('),html.indexOf('function tyreBookingDescription('))+html.slice(html.indexOf('function tyreReviewHtml('),html.indexOf('function partsRangeHtml(')),c);
 for(const detail of ['225/40R18','Premium','Michelin','Pilot Sport','£280'])assert.ok(c.tyreReviewHtml().includes(detail));assert.doesNotMatch(c.tyreReviewHtml(),/£140|price per tyre/i);assert.equal((c.tyreReviewHtml().match(/£280/g)||[]).length,1);assert.doesNotMatch(c.tyreReviewHtml(),/guide/i);assert.match(c.tyreReviewHtml(),/If the brand changes it’s due to limited stock levels/);
 for(const [key,value] of [['tyre_size','205/55R16'],['tyre_choice','Budget'],['tyre_quantity',1]]){const old=form[key];form[key]=value;assert.equal(c.savedTyreGuide(),null);assert.doesNotMatch(c.tyreReviewHtml(),/Michelin/);form[key]=old}
 quote.checkedAt=new Date(Date.now()-300001).toISOString();assert.equal(c.savedTyreGuide(),null);assert.doesNotMatch(c.tyreReviewHtml(),/£280/);
});
