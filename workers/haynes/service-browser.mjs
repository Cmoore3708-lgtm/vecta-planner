import { writeFile } from 'node:fs/promises';
import { chooseSchedule } from './schedule-choice.mjs';
import { START } from './browser.mjs';
import { readVehicle } from './dom.mjs';
import { readSchedule, readOil, readDirectSchedules, readConditionSchedules, readScheduleDiagnostics } from './service-dom.mjs';
import { vehicleResult, HaynesError } from '../../lib/haynes-vehicle.js';
import { serviceRequest, serviceResult, selectServicePeriod } from '../../lib/haynes-service.js';
export const SERVICE_WORKER_VERSION = '2026-10-14.4';
console.log('VECTA Haynes service worker version '+SERVICE_WORKER_VERSION);
export function browserServiceLookup(context, { chooseConditions } = {}) {
  return async raw => {
    const input=serviceRequest(raw);
    let page, deadline, stage='OPEN_BROWSER', expired=false, keepFailedPage=false;
    const started=Date.now();
    try {
      page=await context.newPage();
      page.setDefaultTimeout(12000);
      deadline=setTimeout(()=>{expired=true;page.close().catch(()=>{});},60000);
      await page.route('**/*',r=>['https://www.workshopdata.com','https://www.haynespro-assets.com'].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
      stage='OPEN_SEARCH';
      await page.goto(START,{waitUntil:'domcontentloaded'});
      stage='CHECK_LOGIN';
      const initial=await page.evaluate(readVehicle);
      if(initial.login)throw new HaynesError('LOGIN_REQUIRED');
      if(initial.blocked)throw new HaynesError('VERIFICATION_REQUIRED');
      stage='ENTER_REGISTRATION';
      await page.locator('#numberPlate,input[name="numberPlate"]').fill(input.registration);
      stage='SUBMIT_REGISTRATION';
      await page.locator('#licencePlateBtn').click();
      stage='WAIT_VEHICLE';
      let data;
      for (let n=0;n<60;n++) {
        try { data=await page.evaluate(readVehicle); if(String(data.registration||'').replace(/[^A-Z0-9]/gi,'').toUpperCase()===input.registration||data.login||data.blocked||data.ambiguous)break; } catch(e) { if(!/context was destroyed|Cannot find context/i.test(e.message))throw e; }
        await new Promise(r=>setTimeout(r,200));
      }
      if(data?.login)throw new HaynesError('LOGIN_REQUIRED');
      if(data?.blocked)throw new HaynesError('VERIFICATION_REQUIRED');
      stage='VALIDATE_VEHICLE';
      const vehicle=vehicleResult(data,input.registration);
      stage='WAIT_SERVICE_MENU';
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('select')).some(s=>
        (s.getAttribute('onchange')||'').includes('/maintenanceSchedule?') ||
        Array.from(s.options).some(o=>/Normal conditions/i.test(o.textContent))
      ),null,{timeout:12000});
      stage='READ_SERVICE_MENU';
      const direct=await page.evaluate(readDirectSchedules);
      let conditions,system,links;
      if(direct) {
        if(direct.ambiguous)throw new HaynesError('SCHEDULE_REQUIRED');
        if(direct.typeId!==vehicle.typeId)throw new HaynesError('MISMATCH');
        ({conditions,system,links}=direct);
      } else {
        stage='READ_CONDITIONS';
      const select=page.locator('select').filter({has:page.locator('option').filter({hasText:/Normal conditions/i})}).first();
        const options=await select.locator('option').evaluateAll(items=>items.map(item=>({value:item.value,label:item.textContent})));
        stage='CHOOSE_CONDITIONS';
      const choice=await chooseSchedule(options,vehicle,chooseConditions);
        conditions=choice.label;system=choice.system;
        stage='LOAD_CONDITION_SCHEDULES';
      await select.selectOption({value:choice.value});
        // Newer Haynes pages use radio intervals and a GET Continue form,
        // rather than links. Read fresh rendered fields, including the CSRF token.
        const until=Date.now()+12000;
        do {
          links=await page.evaluate(readConditionSchedules);
          if(links.some(link=>{try{const url=new URL(link.href);return url.searchParams.get('typeId')===vehicle.typeId&&url.searchParams.get('maintenanceSystemId')===system;}catch{return false;}}))break;
          await new Promise(resolve=>setTimeout(resolve,200));
        } while(Date.now()<until);
        if(!links.length)throw new HaynesError('SCHEDULE_REQUIRED');
      }
      
      const match=String(data.registrationDate||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const now=new Date(), ageMonths=match?Math.max(0,(now.getUTCFullYear()-Number(match[3]))*12+now.getUTCMonth()+1-Number(match[2])-(now.getUTCDate()<Number(match[1])?1:0)):null;
      stage='SELECT_MILEAGE';
      const selected=selectServicePeriod(links,{...input,system,typeId:vehicle.typeId,ageMonths});
      if(selected && new URL(selected.href).searchParams.get('typeId')!==vehicle.typeId)throw new HaynesError('MISMATCH');
      if(!selected)throw new HaynesError('SCHEDULE_REQUIRED');
      stage='OPEN_SERVICE_SCHEDULE';
      await page.goto(selected.href,{waitUntil:'domcontentloaded'});
      stage='WAIT_SERVICE_SCHEDULE';
      await page.locator('#selectedPeriod').waitFor({state:'visible'});
      stage='READ_SERVICE_SCHEDULE';
      const schedule=await page.evaluate(readSchedule);
      let oil=[];
      if(schedule.oilLink) {
        stage='VALIDATE_OIL_LINK';
      const url=new URL(schedule.oilLink);
        if(url.origin!=='https://www.workshopdata.com'||url.pathname!=='/touch/site/layout/lubricants'||url.searchParams.get('typeId')!==vehicle.typeId)throw new HaynesError('INCOMPLETE');
        stage='OPEN_OIL_PAGE';
      await page.goto(url.href,{waitUntil:'domcontentloaded'});
        stage='WAIT_OIL_DATA';
      await page.locator('.filter-lubricant-data').first().waitFor({state:'visible'});
        stage='READ_OIL_DATA';
      oil=await page.evaluate(readOil);
      }
      stage='VALIDATE_RESULT';
      const result=serviceResult({...schedule,vehicle,mileage:input.mileage,conditions,oil,ageMonths},input);
      console.log('Haynes service '+input.registration+' completed - '+result.schedule);
      return result;
    } catch(error) {
      const reason=expired?'SERVICE_DEADLINE':error.name==='TimeoutError'?'TIMEOUT':['LOGIN_REQUIRED','VERIFICATION_REQUIRED','SCHEDULE_REQUIRED','MISMATCH','INCOMPLETE','AMBIGUOUS'].includes(error.code)?error.code:/page, context or browser has been closed|target closed/i.test(error.message||'')?'PAGE_CLOSED':'BROWSER_ERROR';
      console.log('Haynes service '+input.registration+' failed - step '+stage+' - reason '+reason+' - '+Math.round((Date.now()-started)/1000)+'s - version '+SERVICE_WORKER_VERSION);
      if(process.env.HAYNES_SERVICE_DIAGNOSTICS==='1' && page && !page.isClosed()) {
        clearTimeout(deadline);
        keepFailedPage=true;
        try {
          const controls=await page.evaluate(readScheduleDiagnostics);
          await writeFile(new URL('./haynes-service-diagnostic.json',import.meta.url),JSON.stringify({version:SERVICE_WORKER_VERSION,stage,reason,controls},null,2));
          console.log('Diagnostic saved: haynes-service-diagnostic.json in this worker folder. Failed Haynes tab left open.');
          await page.bringToFront();
        } catch { console.log('Could not save diagnostic. Failed Haynes tab left open.'); }
      }
      throw error;
    } finally { clearTimeout(deadline);if(!keepFailedPage)await page?.close().catch(()=>{}); }
  };
}
