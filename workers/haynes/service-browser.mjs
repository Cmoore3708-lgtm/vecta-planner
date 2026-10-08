import { chooseSchedule } from './schedule-choice.mjs';
import { START } from './browser.mjs';
import { readVehicle } from './dom.mjs';
import { readSchedule, readOil } from './service-dom.mjs';
import { vehicleResult, HaynesError } from '../../lib/haynes-vehicle.js';
import { serviceRequest, serviceResult, selectServicePeriod } from '../../lib/haynes-service.js';
export function browserServiceLookup(context, { chooseConditions } = {}) {
  return async raw => {
    const input=serviceRequest(raw), page=await context.newPage();
    page.setDefaultTimeout(12000);
    const deadline=setTimeout(()=>page.close().catch(()=>{}),60000);
    try {
      await page.route('**/*',r=>['https://www.workshopdata.com','https://www.haynespro-assets.com'].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
      await page.goto(START,{waitUntil:'domcontentloaded'});
      const initial=await page.evaluate(readVehicle);
      if(initial.login)throw new HaynesError('LOGIN_REQUIRED');
      if(initial.blocked)throw new HaynesError('VERIFICATION_REQUIRED');
      await page.locator('#numberPlate,input[name="numberPlate"]').fill(input.registration);
      await page.locator('#licencePlateBtn').click();
      let data;
      for (let n=0;n<60;n++) {
        try { data=await page.evaluate(readVehicle); if(data.registration||data.login||data.blocked||data.ambiguous)break; } catch(e) { if(!/context was destroyed|Cannot find context/i.test(e.message))throw e; }
        await new Promise(r=>setTimeout(r,200));
      }
      if(data?.login)throw new HaynesError('LOGIN_REQUIRED');
      if(data?.blocked)throw new HaynesError('VERIFICATION_REQUIRED');
      const vehicle=vehicleResult(data,input.registration);
      const select=page.locator('select').filter({has:page.locator('option').filter({hasText:/Normal conditions/i})}).first();
      await select.waitFor({state:'attached'});
      const options=await select.locator('option').evaluateAll(items=>items.map(item=>({value:item.value,label:item.textContent})));
      const choice=await chooseSchedule(options,vehicle,chooseConditions);
      const conditions=choice.label, system=choice.system;
      await select.selectOption({value:choice.value});
      await page.locator('a[href*="maintenanceSchedule?"]').first().waitFor({state:'attached'});
      const links=await page.locator('a[href*="maintenanceSchedule?"]').evaluateAll(as=>as.map(a=>({href:a.href,label:a.textContent.replace(/\s+/g,' ').trim()})));
      
      const match=String(data.registrationDate||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const now=new Date(), ageMonths=match?Math.max(0,(now.getUTCFullYear()-Number(match[3]))*12+now.getUTCMonth()+1-Number(match[2])-(now.getUTCDate()<Number(match[1])?1:0)):null;
      const selected=selectServicePeriod(links,{...input,system,typeId:vehicle.typeId,ageMonths});
      if(selected && new URL(selected.href).searchParams.get('typeId')!==vehicle.typeId)throw new HaynesError('MISMATCH');
      if(!selected)throw new HaynesError('SCHEDULE_REQUIRED');
      await page.goto(selected.href,{waitUntil:'domcontentloaded'});
      await page.locator('#selectedPeriod').waitFor({state:'visible'});
      const schedule=await page.evaluate(readSchedule);
      let oil=[];
      if(schedule.oilLink) {
        const url=new URL(schedule.oilLink);
        if(url.origin!=='https://www.workshopdata.com'||url.pathname!=='/touch/site/layout/lubricants'||url.searchParams.get('typeId')!==vehicle.typeId)throw new HaynesError('INCOMPLETE');
        await page.goto(url.href,{waitUntil:'domcontentloaded'});
        await page.locator('.filter-lubricant-data').first().waitFor({state:'visible'});
        oil=await page.evaluate(readOil);
      }
      return serviceResult({...schedule,vehicle,mileage:input.mileage,conditions,oil,ageMonths},input);
    } finally { clearTimeout(deadline);await page.close().catch(()=>{}); }
  };
}
