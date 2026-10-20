// Review-only snapshot: never copied into the deployed website.
import {readFileSync,writeFileSync} from 'node:fs';
import {selectCatalogueGuides} from '../workers/tyres/tiers.mjs';
const source=readFileSync('website/booking/index.html','utf8');
const style=source.match(/<style>([\s\S]*?)<\/style>/)[1]+'\n'+readFileSync('public/js/vecta-tyre-booking.css','utf8');
const image='data:image/webp;base64,'+readFileSync('public/assets/tyre-guide-cutout.webp').toString('base64');
const functions=source.slice(source.indexOf('let tyreGuideState='),source.indexOf('function pricingHtml(')).replaceAll('/assets/tyre-guide-cutout.webp',image);
const fixtures=JSON.parse(readFileSync('workers/tyres/confirmed-catalogue-fixture.json'));
const data=Object.fromEntries(fixtures.map(f=>[f.requestedSize,Object.fromEntries([1,2,3,4].map(quantity=>[quantity,selectCatalogueGuides(f.guideCatalogue,{size:f.requestedSize,quantity,settings:f.settings})]))]));
const client=readFileSync('public/js/vecta-tyre-booking.js','utf8');
const out=process.argv[2];if(!out)throw Error('Provide an absolute output HTML path');
writeFileSync(out,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vecta tyre cards — review</title><style>${style}\n.review-note{padding:12px 15px;background:#fff5e9;border:1px solid #dfbc86;border-radius:10px;color:#754a14!important;font-size:12px!important;line-height:1.6;margin:18px 0 0!important}.step{min-height:0}.top{padding-bottom:0}</style></head><body><main class="shell"><header class="brand"><div class="logo">VECTA</div><span>Motors · Booking preview</span></header><div class="card"><div class="top"><h1>Your tyres</h1><p class="review-note">Design preview using captured supplier prices from 20 October 2026. This is not a live quote. Try <b>205/55R16</b> or <b>225/45R17</b>, choose a range, and change the quantity. Other sizes show the enquiry fallback.</p></div><section class="step"><div id="reviewPanel"></div><label>Describe work required/symptoms in as much detail as possible<textarea placeholder="Tell us which tyres need replacing…"></textarea></label></section></div></main><script>${client}</script><script>
const sample=${JSON.stringify(data)};
window.fetch=async(_url,options)=>{const {size,quantity}=JSON.parse(options.body);await new Promise(r=>setTimeout(r,350));return {ok:true,json:async()=>sample[size]?.[quantity]?{status:'MATCHED',...sample[size][quantity],checkedAt:new Date().toISOString()}:{status:'UNAVAILABLE'}}};
const state={form:{job_types:['Tyres'],tyre_size:'205/55R16',tyre_quantity:1,tyre_choice:'Budget',nevos_vehicle:'no',tyre_guide:null}};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function renderActions(){}
${functions}
document.getElementById('reviewPanel').innerHTML=tyreOptionsHtml();bindTyreCards();
document.querySelector('[data-field="tyre_size"]').oninput=e=>{state.form.tyre_size=e.target.value.toUpperCase();state.form.tyre_guide=null;tyreLookup.update(state.form.tyre_size,state.form.tyre_quantity);};
tyreLookup.update(state.form.tyre_size,state.form.tyre_quantity);
</script></body></html>`);
console.log('Built review-only tyre cards preview');
