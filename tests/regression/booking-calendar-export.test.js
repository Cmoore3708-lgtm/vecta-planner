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
 vm.runInContext(fs.readFileSync('public/js/vecta-tyre-booking.js','utf8'),c);
 vm.runInContext(html.slice(html.indexOf('function savedTyreGuide('),html.indexOf('function tyreBookingDescription('))+html.slice(html.indexOf('function tyreReviewHtml('),html.indexOf('function partsRangeHtml(')),c);
 for(const detail of ['225/40R18','Premium','Michelin','Pilot Sport','£280'])assert.ok(c.tyreReviewHtml().includes(detail));assert.doesNotMatch(c.tyreReviewHtml(),/£140|price per tyre/i);assert.equal((c.tyreReviewHtml().match(/£280/g)||[]).length,1);assert.doesNotMatch(c.tyreReviewHtml(),/guide/i);assert.doesNotMatch(c.tyreReviewHtml(),/If the brand changes it’s due to limited stock levels/);
 for(const [key,value] of [['tyre_size','205/55R16'],['tyre_choice','Budget'],['tyre_quantity',1]]){const old=form[key];form[key]=value;assert.equal(c.savedTyreGuide(),null);assert.doesNotMatch(c.tyreReviewHtml(),/Michelin/);form[key]=old}
 quote.priceSource='saved';quote.servedAt=new Date().toISOString();quote.checkedAt=new Date(Date.now()-2*86400000).toISOString();assert.match(c.tyreReviewHtml(),/Saved guide total/);assert.match(c.tyreReviewHtml(),/last checked/);
 delete quote.priceSource;delete quote.servedAt;quote.checkedAt=new Date(Date.now()-300001).toISOString();assert.equal(c.savedTyreGuide(),null);assert.doesNotMatch(c.tyreReviewHtml(),/£280/);
});

test('confirmation calendar link exports the selected registration, work and date',()=>{
 for(const path of ['website/booking/index.html','public/booking.html']){
  const source=fs.readFileSync(path,'utf8');
  const c=vm.createContext({state:{form:{registration:'AB12 CDE',job_types:['Service','MOT'],service_choice:'Full Service'}},URLSearchParams,esc:String});
  vm.runInContext(source.slice(source.indexOf('function calendarEscape('),source.indexOf('async function submit(')),c);
  const html=c.bookingReceiptActionsHtml('2026-12-31','confirmed-booking');
  assert.match(html,/> Add to Calendar<\/a>/);
  assert.match(html,/aria-describedby="booking-calendar-help"/);
  const url=new URL(html.match(/class="receipt-calendar"[^>]*href="([^"]+)"/)[1],'https://vectamotors.co.uk');
  const r=response();handler({method:'GET',query:Object.fromEntries(url.searchParams)},r);
  assert.equal(r.code,200);assert.match(r.body,/DTSTART;VALUE=DATE:20261231/);
  assert.match(r.body,/DTEND;VALUE=DATE:20270101/);assert.match(r.body,/Full Service/);assert.match(r.body,/AB12 CDE/);
  assert.match(r.body,/UID:confirmed-booking@vectamotors.co.uk/);
  assert.doesNotMatch(c.bookingReceiptActionsHtml('not-a-date','id'),/class="receipt-calendar"/);
 }
});

test('spark plug confirmation omits price-before-fitting sentence while preserving estimates',()=>{
 const source=fs.readFileSync('website/booking/index.html','utf8');
 const c=vm.createContext({serviceExtraKind:()=> 'spark_plug',serviceExtraSelection:()=> 'check',serviceExtraOffer:()=>null});
 vm.runInContext(source.slice(source.indexOf('function serviceExtraSummary('),source.indexOf('function serviceExtraHtml(')),c);
 assert.match(c.serviceExtraSummary(),/Spark plugs: check manufacturer’s guidance; replace if due\.$/);
 assert.doesNotMatch(c.serviceExtraSummary(),/confirm the price before fitting/);
 c.serviceExtraOffer=()=>({totalPence:8500});assert.match(c.serviceExtraSummary(),/Extra £85 including fitting and VAT/);
 c.serviceExtraOffer=()=>null;c.serviceExtraKind=()=> 'fuel_filter';assert.match(c.serviceExtraSummary(),/We will confirm the price before fitting/);
});
