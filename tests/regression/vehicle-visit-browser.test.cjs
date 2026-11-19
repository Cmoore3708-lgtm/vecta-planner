const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('morning checks, invoice handover and website colours survive reopening across owner and mechanics layouts',{
  skip:!process.env.GITHUB_ACTIONS&&!process.env.VECTA_CHROME_BIN,timeout:120000
},async()=>{
  const {chromium,devices}=require(require.resolve('playwright',{paths:[path.resolve('workers/haynes')]}));
  const {mechanicVariant}=await import('../../scripts/mechanic-variant.mjs');
  const browser=await chromium.launch({executablePath:process.env.VECTA_CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
  const main=fs.readFileSync('index.html','utf8'),mechanic=mechanicVariant(main);
  const origin='https://vecta-planner-audit-system-simplification.test',key='vecta_workshop_pro_v41_data';
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());
  const job={id:'11111111-1111-4111-8111-111111111111',customer_account:'Staff',customer_name:'Alex Example',registration:'QA12ABC',technician:'Alfie',booking_date:date,drop_time:'09:00',status:'booked',estimated_hours:1,job_type:'Other',card_type:'job',vehicle:'Nissan Leaf',work_required:'Check brakes',source:'website booking'};
  const paid={...job,id:'11111111-1111-4111-8111-111111111112',registration:'QA12ABD',status:'completed',archived:true,visit_billing:'paid'};
  const seed={settings:{mechanics:['Alfie','Chris']},jobs:[job,paid]};
  try{
    for(const [device,owner] of [['Desktop Chrome',true],['iPhone 13',true],['iPad (gen 7)',false],['iPhone 13',false]]){
      const context=await browser.newContext({...devices[device],serviceWorkers:'block',timezoneId:'Europe/London'});
      try{
        await context.addInitScript(({key,seed})=>{if(!localStorage.getItem('visit-test')){localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem('visit-test','1');}},{key,seed});
        await context.route('**/*',async route=>{
          const url=new URL(route.request().url());
          if(url.origin!==origin)return route.abort();
          if(url.pathname==='/'||url.pathname==='/mechanic.html')return route.fulfill({contentType:'text/html',body:owner?main:mechanic});
          if(url.pathname==='/api/job-progress'&&route.request().postDataJSON()?.action==='visit-status'){
            const body=route.request().postDataJSON();return route.fulfill({json:{job:{id:body.job_id,status:'booked',visit_presence:body.visit_state,visit_presence_date:date}}});
          }
          if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/supabase-config'?{auditPreview:true}:{}});
          const file=path.resolve('public','.'+url.pathname);
          if(file.startsWith(path.resolve('public')+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
          return route.fulfill({status:404,body:''});
        });
        const page=await context.newPage();
        await page.goto(origin+(owner?'/':'/mechanic.html'),{waitUntil:'domcontentloaded'});
        const card=page.locator('[data-job-id="'+job.id+'"]:visible,[data-open-job="'+job.id+'"]:visible').first();
        await card.waitFor({timeout:20000});
        if(!owner){assert.equal(await page.locator('.visitSelector').count(),0);continue;}
        const select=card.locator('.visitSelector');
        await select.waitFor();
        assert.equal(await select.inputValue(),'waiting',device);
        assert.deepEqual(await select.locator('option').allTextContents(),['Not here','Waiting','Workshop','Done']);
        const corners=await card.evaluate(node=>{
          const box=node.getBoundingClientRect(),dot=node.querySelector('.dashboardPartsControl').getBoundingClientRect(),status=node.querySelector('.visitSelector').getBoundingClientRect();
          return Math.abs(dot.top-box.top)<10&&Math.abs(dot.right-box.right)<10&&Math.abs(status.right-box.right)<10&&Math.abs(status.bottom-box.bottom)<10;
        });
        assert.equal(corners,true,device);
        assert.equal(await page.locator('[data-job-id="'+paid.id+'"]:visible select,[data-open-job="'+paid.id+'"]:visible select').first().inputValue(),'paid',device);
        const style=await card.evaluate(node=>{const s=getComputedStyle(node),box=node.getBoundingClientRect(),control=node.querySelector('.visitSelector').getBoundingClientRect();return {border:s.borderTopColor,blue:s.backgroundColor,inside:control.top>=box.top-1&&control.bottom<=box.bottom+1&&control.left>=box.left-1&&control.right<=box.right+1};});
        assert.equal(style.inside,true,device);assert.equal(style.border,'rgb(0, 122, 128)',device);assert.equal(style.blue,'rgb(223, 240, 255)',device);
        await select.selectOption('missing');await page.waitForFunction(()=>!!document.querySelector('[data-visit-state="missing"]'));
        assert.equal(await page.locator('#jobModal').isVisible(),false,device);
        await page.reload({waitUntil:'domcontentloaded'});await select.waitFor();assert.equal(await select.inputValue(),'missing',device);
      }finally{await context.close();}
    }
  }finally{await browser.close();}
});
