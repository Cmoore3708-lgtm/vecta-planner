import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {DOMParser} from 'linkedom';
import {paintedVehicleSvg,vehiclePaintColours} from '../../lib/vehicle-paint-svg.js';
import {savedBookingImage,confirmationContent} from '../../lib/portal-email.js';

const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" onload="bad()"><script>bad()</script><g id="transparant_colour"><path fill="#ffffff" d="M0 0H100V50H0Z"/><path fill="none" stroke="#000000" d="M10 10H20"/></g><g id="windows"><rect x="30" y="5" width="20" height="10" fill="#222222"/></g><g id="wheels"><rect x="5" y="35" width="15" height="15" fill="#333333"/></g><image href="https://example.invalid/unsafe"/></svg>';
const art={registration:'X80JFC',make:'MERCEDES-BENZ',model:'E (W213)',colour:'Red',imageUrl:'https://www.haynespro-assets.com/workshop/images/319003624.svgz'};
const job={registration:'X80 JFC',make:'',model:'',vehicle:'MERCEDES-BENZ E',booking_date:'2026-11-17'};
const row=(kind,value)=>({id:kind+':X80JFC',value});
async function render(rows){
  let reads=0;
  const image=await savedBookingImage(async path=>{
    const q=new URLSearchParams(path.split('?')[1]);
    assert.equal(q.get('id'),'in.(vehicle_artwork:X80JFC,vehicle_identity:X80JFC,vehicle_colour:X80JFC)');
    return rows;
  },job,async asset=>{reads++;assert.equal(asset,'319003624.svgz');return source;});
  return {image,reads};
}
async function pixel(image,x=60,y=20){
  return [...await sharp(Buffer.from(image,'base64')).resize(100,50).removeAlpha().extract({left:x,top:y,width:1,height:1}).raw().toBuffer()];
}
test('X80 JFC confirmation embeds a red PNG from its saved drawing without a supplier lookup',async()=>{
  const {colour,...identity}=art;
  const {image,reads}=await render([row('vehicle_artwork',art),row('vehicle_identity',identity),row('vehicle_colour',{registration:'X80JFC',make:art.make,colour:'Red'})]);
  assert.equal(reads,1);assert.deepEqual(await pixel(image),[172,23,39]);
  assert.deepEqual(await pixel(image,40,10),[34,34,34]);assert.deepEqual(await pixel(image,12,42),[51,51,51]);
  const mail=confirmationContent(job,'https://example.invalid/portal',image);
  assert.match(mail.html,/cid:booking-vehicle/);assert.equal(mail.attachments[0].content,image);
});
test('saved registration colour wins over old artwork, while manual artwork retains its override',async()=>{
  const paint=row('vehicle_colour',{registration:'X80JFC',make:art.make,colour:'Blue'});
  assert.deepEqual(await pixel((await render([row('vehicle_artwork',art),paint])).image),[28,71,120]);
  assert.deepEqual(await pixel((await render([row('vehicle_artwork',{...art,manual:true}),paint])).image),[172,23,39]);
});
test('another registration or make cannot supply the colour or illustration',async()=>{
  for(const paint of [{registration:'OTHER',make:art.make,colour:'Blue'},{registration:'X80JFC',make:'FORD',colour:'Blue'}]){
    assert.deepEqual(await pixel((await render([row('vehicle_artwork',art),row('vehicle_colour',paint)])).image),[172,23,39]);
  }
  assert.deepEqual(await render([row('vehicle_artwork',{...art,registration:'OTHER'})]),{image:null,reads:0});
});
test('unsupported paint and unavailable drawings fail gracefully without unsafe SVG content',async()=>{
  for(const colour of ['', 'MULTICOLOUR']){
    const svg=paintedVehicleSvg(source,colour);assert.match(svg,/#ffffff/);assert.doesNotMatch(svg,/script|onload|image|unsafe/);
  }
  const svg=paintedVehicleSvg(source.replaceAll('transparant_colour','transparent_colour'),'red');
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  assert.equal(doc.querySelector('#transparent_colour path').getAttribute('fill'),'#ac1727');
  assert.equal(doc.querySelectorAll('#transparent_colour path')[1].getAttribute('fill'),'none');
  assert.equal(await savedBookingImage(async()=>[row('vehicle_artwork',art)],job,async()=>null),null);
});
test('email paint palette matches the existing website and planner palette',()=>{
  const helper=readFileSync('public/js/vecta-vehicle-image.js','utf8');
  const palette=vm.runInNewContext('('+helper.match(/const colours = (\{[^;]+\});/)[1]+')');
  assert.deepEqual(JSON.parse(JSON.stringify(palette)),vehiclePaintColours);
});
