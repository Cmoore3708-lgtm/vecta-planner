import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

const runBrowser=process.env.GITHUB_ACTIONS||process.env.VECTA_CHROME_BIN;
const storeKey='vecta_workshop_pro_v41_data';
const origin='https://vecta-planner-audit-system-simplification.test';
const jobId='54c12951-734d-4091-b513-d9d56338c707';

test('parts light saves from the running planner and survives phone reopening and reconnection',{
  skip:!runBrowser,timeout:120000
},async()=>{
  const {chromium,devices}=createRequire(new URL('../../workers/haynes/package.json',import.meta.url))('playwright');
  const browser=await chromium.launch({executablePath:process.env.VECTA_CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
  const main=fs.readFileSync('index.html','utf8'),mechanic=mechanicVariant(main);
  const today=new Date().toISOString().slice(0,10);
  const seed={settings:{mechanics:['Alfie','Chris']},jobs:[{id:jobId,customer_account:'Staff',customer_name:'Alexandra Smith',registration:'QA12ABC',technician:'Alfie',
    booking_date:today,drop_time:'09:00',status:'booked',estimated_hours:1,job_type:'Other',card_type:'job',
    vehicle:'Nissan Qashqai',work_required:'Check brakes',amount_quoted:55,customer_note:'Keep this note\n[[PARTS_STATUS:Parts need ordering]]'}]};
  try{
    for(const [device,mechanics] of [['Desktop Chrome',false],['iPhone 13',false],['iPad (gen 7)',true]]){
      const context=await browser.newContext({...devices[device],serviceWorkers:'block',timezoneId:'Europe/London'});
      try{
        await context.addInitScript(({storeKey,seed})=>{
          if(!localStorage.getItem('synthetic-parts-job')){localStorage.setItem(storeKey,JSON.stringify(seed));localStorage.setItem('synthetic-parts-job','1');}
        },{storeKey,seed});
        await context.route('**/*',async route=>{
          const url=new URL(route.request().url());
          if(url.origin!==origin)return route.abort();
          if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:mechanics?mechanic:main});
          if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/supabase-config'?{auditPreview:true}:{}});
          const file=path.resolve('public','.'+url.pathname);
          if(file.startsWith(path.resolve('public')+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
          return route.fulfill({status:404,body:''});
        });
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        const open=()=>page.goto(origin,{waitUntil:'domcontentloaded'});
        const selector='select[data-dashboard-parts="'+jobId+'"]:visible';
        const control=page.locator(selector).first();
        await open();
        try{await control.waitFor({timeout:25000})}
        catch(error){
          const diagnostic=await page.evaluate(({storeKey,jobId})=>({loading:document.body.className,
            localJobs:JSON.parse(localStorage.getItem(storeKey))?.jobs?.filter(j=>j.id===jobId).length,
            date:document.querySelector('#currentDate')?.value,lanes:[...document.querySelectorAll('[data-tech]')].map(el=>el.dataset.tech),
            fatal:document.querySelector('#fatalError')?.textContent}),{storeKey,jobId});
          throw new Error(device+' '+JSON.stringify({diagnostic,errors}),{cause:error});
        }
        assert.equal(await control.inputValue(),'Parts need ordering',device);
        await control.click();await page.keyboard.press('Escape');
        await control.selectOption('Awaiting parts');
        await page.waitForFunction(({storeKey,jobId})=>JSON.parse(localStorage.getItem(storeKey)).jobs.find(j=>j.id===jobId)?.parts_status==='Awaiting parts',{storeKey,jobId});
        assert.equal(await page.locator('#jobModal').isVisible(),false,device);
        await page.reload({waitUntil:'domcontentloaded'});await control.waitFor();
        assert.equal(await control.inputValue(),'Awaiting parts',device+' reopen');
        if(device==='iPhone 13'){
          await context.setOffline(true);
          await control.selectOption('Parts here');
          await page.waitForFunction(({storeKey,jobId})=>JSON.parse(localStorage.getItem(storeKey)).jobs.find(j=>j.id===jobId)?.parts_status==='Parts here',{storeKey,jobId});
          await context.setOffline(false);await page.reload({waitUntil:'domcontentloaded'});await control.waitFor();
          assert.equal(await control.inputValue(),'Parts here','reconnected phone');
        }
        if(device==='Desktop Chrome'){
          for(const view of ['fleet','jobs','invoices','invoiceArchive','websiteRequests']){
            await page.goto(origin+'/?view='+view,{waitUntil:'domcontentloaded'});
            await page.waitForFunction(()=>document.querySelector('#content')?.innerText.trim().length>10);
          }
        }
      }finally{await context.close()}
    }
  }finally{await browser.close()}
});
