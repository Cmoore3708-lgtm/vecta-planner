import { writeFile } from 'node:fs/promises';
import { chooseSchedule, ukSchedules } from './schedule-choice.mjs';
import { START } from './browser.mjs';
import { readVehicle } from './dom.mjs';
import { readSchedule, readOil, readDirectSchedules, readConditionSchedules, readScheduleDiagnostics, readScheduleSelectors } from './service-dom.mjs';
import { vehicleResult, HaynesError } from '../../lib/haynes-vehicle.js';
import { serviceRequest, serviceResult, selectServicePeriod } from '../../lib/haynes-service.js';
export const SERVICE_WORKER_VERSION = '2026-10-14.10';
console.log('VECTA Haynes service worker version '+SERVICE_WORKER_VERSION);
export function browserServiceLookup(context, { chooseConditions } = {}) {
  const retainDiagnosticPage=createDiagnosticPageRetainer(context);
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
        Array.from(s.options).some(o=>/^ms_\d+$/.test(String(o.value).split(',')[0])&&/\(United Kingdom\)\s*$/i.test(o.textContent.trim()))
      ),null,{timeout:12000});
      stage='READ_SERVICE_MENU';
      const direct=await page.evaluate(readDirectSchedules);
      let conditions,system,links,schedules=[];
      if(direct) {
        if(direct.ambiguous)throw new HaynesError('SCHEDULE_REQUIRED');
        if(direct.typeId!==vehicle.typeId)throw new HaynesError('MISMATCH');
        ({conditions,system,links}=direct);
        if(input.system&&input.system!==system)throw new HaynesError('SCHEDULE_REQUIRED');
        schedules=[{id:system,label:conditions}];
      } else {
        stage='READ_CONDITIONS';
      const menus=await page.evaluate(readScheduleSelectors);
        if(!menus.length)throw new HaynesError('SCHEDULE_REQUIRED');
        const signature=JSON.stringify(ukSchedules(menus[0].options));
        if(menus.some(menu=>JSON.stringify(ukSchedules(menu.options))!==signature))throw new HaynesError('SCHEDULE_REQUIRED');
        const select=page.locator('select').nth(menus[0].index), options=menus[0].options;
        const choices=ukSchedules(options);
        schedules=choices.map(choice=>({id:choice.system,label:choice.label}));
        stage='CHOOSE_CONDITIONS';
        if(input.scheduleMode==='choose'&&!input.system&&choices.length>1) {
          console.log('Haynes service '+input.registration+' returned '+choices.length+' schedules for mechanic selection');
          return serviceResult({kind:'schedule_choices',vehicle,mileage:input.mileage,period:'',schedules},input);
        }
        const requested=input.system?choices.find(choice=>choice.system===input.system):null;
        if(input.system&&!requested)throw new HaynesError('SCHEDULE_REQUIRED');
        const choice=requested||await chooseSchedule(options,vehicle,chooseConditions);
        conditions=choice.label;system=choice.system;
        stage='WAIT_CONDITION_HANDLER';
        await page.waitForLoadState('load');
        await select.evaluate(async el=>{
          const name=(el.getAttribute('onchange')||'').match(/^\s*([A-Za-z_$][\w$]*)\s*\(/)?.[1];
          if(!name)return;
          const until=Date.now()+8000;
          while(typeof window[name]!=='function'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));
          if(typeof window[name]!=='function')throw Error('Condition handler unavailable');
        });
        stage='LOAD_CONDITION_SCHEDULES';
        await select.selectOption({value:choice.value});
        // Newer Haynes pages use radio intervals and a GET Continue form,
        // rather than links. Read fresh rendered fields, including the CSRF token.
        const until=Date.now()+12000;
        let retried=false;
        do {
          links=await page.evaluate(readConditionSchedules);
          if(links.some(link=>{try{const url=new URL(link.href);return url.searchParams.get('typeId')===vehicle.typeId&&url.searchParams.get('maintenanceSystemId')===system;}catch{return false;}}))break;
          // The retained page worked when the user reselected the menu manually.
          // Retry once using native keyboard events after the handler has loaded.
          if(!retried && Date.now()>until-8000) {
            retried=true;
            const index=options.findIndex(option=>option.value===choice.value);
            if(index<0||index>20)throw new HaynesError('SCHEDULE_REQUIRED');
            await select.press('Home');
            for(let n=0;n<index;n++)await select.press('ArrowDown');
            await select.press('Tab');
          }
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
      if(selected.checkboxId) {
        stage='SELECT_INTERVAL_CHECKBOX';
        await selectCheckboxSchedule(page,selected,links);
        stage='CONTINUE_SERVICE_SCHEDULE';
        const buttons=page.getByText('Continue',{exact:true});
        let continued=false;
        for(let n=0;n<await buttons.count();n++)if(await buttons.nth(n).isVisible()){
          await buttons.nth(n).click();continued=true;break;
        }
        if(!continued)throw new HaynesError('SCHEDULE_REQUIRED');
      } else {
        await page.goto(selected.href,{waitUntil:'domcontentloaded'});
      }
      stage='WAIT_SERVICE_SCHEDULE';
      await page.locator('#selectedPeriod').waitFor({state:'visible'});
      if(selected.checkboxId) {
        const url=new URL(page.url());
        const expected=new URL(selected.href);
        if(url.origin!=='https://www.workshopdata.com'||url.pathname!=='/touch/site/layout/maintenanceSchedule'||url.searchParams.get('typeId')!==vehicle.typeId||url.searchParams.get('maintenanceSystemId')!==system||await page.locator('#selectedPeriod').inputValue()!==expected.searchParams.get('maintenancePeriodId'))throw new HaynesError('MISMATCH');
      }
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
      oil=(await page.evaluate(readOil)).map(item=>({...item,capacity:item.capacity||schedule.oilCapacity||''}));
      }
      stage='VALIDATE_RESULT';
      const result=serviceResult({...schedule,vehicle,mileage:input.mileage,conditions,system,schedules,oil,ageMonths},input);
      console.log('Haynes service '+input.registration+' completed - '+result.schedule+' - engine oil rows '+result.oil.length);
      return result;
    } catch(error) {
      const reason=expired?'SERVICE_DEADLINE':error.name==='TimeoutError'?'TIMEOUT':['LOGIN_REQUIRED','VERIFICATION_REQUIRED','SCHEDULE_REQUIRED','MISMATCH','INCOMPLETE','AMBIGUOUS'].includes(error.code)?error.code:/page, context or browser has been closed|target closed/i.test(error.message||'')?'PAGE_CLOSED':'BROWSER_ERROR';
      console.log('Haynes service '+input.registration+' failed - step '+stage+' - reason '+reason+' - '+Math.round((Date.now()-started)/1000)+'s - version '+SERVICE_WORKER_VERSION);
      if(process.env.HAYNES_SERVICE_DIAGNOSTICS==='1' && page && !page.isClosed()) {
        clearTimeout(deadline);
        keepFailedPage=await retainDiagnosticPage(page);
        try {
          const controls=await page.evaluate(readScheduleDiagnostics);
          await writeFile(new URL('./haynes-service-diagnostic.json',import.meta.url),JSON.stringify({version:SERVICE_WORKER_VERSION,stage,reason,controls},null,2));
          console.log('Diagnostic saved: haynes-service-diagnostic.json in this worker folder. '+(keepFailedPage?'Failed Haynes tab left open.':'Failed tab will close: diagnostic retention unavailable.'));
          await page.bringToFront();
        } catch { console.log('Could not finish diagnostic capture.'); }
      }
      throw error;
    } finally { clearTimeout(deadline);if(!keepFailedPage)await page?.close().catch(()=>{}); }
  };
}

// Support both the installed legacy browser context and the recovery wrapper.
export function createDiagnosticPageRetainer(context) {
  let retained=null;
  return async page => {
    if(typeof context.retainDiagnosticPage==='function')return context.retainDiagnosticPage(page);
    if(typeof context.pages!=='function'||!context.pages().includes(page))return false;
    if(retained && retained!==page)await retained.close().catch(()=>{});
    retained=page;
    return true;
  };
}

export async function selectCheckboxSchedule(page,selected,links) {
  if(!/^mp_\d+$/.test(selected.checkboxId||'')||!/^maintenanceSystem_ms_\d+$/.test(selected.systemHeadingId||''))throw new HaynesError('SCHEDULE_REQUIRED');
  // Haynes renders desktop and mobile copies with identical element IDs.
  // Scope all input reads and clicks to the one displayed system list.
  const groups=page.locator('li.dropdown').filter({has:page.locator('a[id="'+selected.systemHeadingId+'"]')});
  let group=null;
  for(let n=0;n<await groups.count();n++) {
    const candidate=groups.nth(n);
    const labels=candidate.locator('label[for="'+selected.checkboxId+'"]');
    if(await labels.count()===1 && await labels.isVisible()) {
      if(group)throw new HaynesError('SCHEDULE_REQUIRED');
      group=candidate;
    }
  }
  if(!group)throw new HaynesError('SCHEDULE_REQUIRED');
  const entries=links.filter(link=>link.checkboxId&&link.systemHeadingId===selected.systemHeadingId);
  const seen=new Set();
  for(const entry of entries) {
    if(seen.has(entry.checkboxId))continue;
    seen.add(entry.checkboxId);
    const input=group.locator('li.combinableSystem_period input[id="'+entry.checkboxId+'"][maintenanceperiodid="'+entry.checkboxId+'"]');
    if(await input.count()!==1)throw new HaynesError('SCHEDULE_REQUIRED');
    const wanted=entry.checkboxId===selected.checkboxId;
    if(await input.isChecked()!==wanted)await group.locator('li.combinableSystem_period label[for="'+entry.checkboxId+'"]').click();
    if(await input.isChecked()!==wanted)throw new HaynesError('SCHEDULE_REQUIRED');
  }
  if(!seen.has(selected.checkboxId))throw new HaynesError('SCHEDULE_REQUIRED');
}
