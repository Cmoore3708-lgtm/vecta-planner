import test from 'node:test';
import assert from 'node:assert/strict';
import {eligible, reminderContent} from '../../lib/nmuk-service-reminders.js';

const date = '2026-09-25';
const vehicle = {registration:'NK75 BBV',fleetGroup:'Nissan Internal',contactEmail:'driver@example.com'};
const job = {booking_date:date,archived:false,status:'booked',customer_name:'NMUK',registration:'NK75BBV',job_type:'Internal Service || On-Site Service',recipient:'driver@example.com'};

test('only an NMUK Internal yearly service with a verified contact qualifies', () => {
  assert.equal(eligible(job,date,vehicle),true);
  assert.equal(eligible({...job,job_type:'On-Site Service'},date,vehicle),false);
  assert.equal(eligible({...job,recipient:''},date,vehicle),false);
  assert.equal(eligible({...job,status:'completed'},date,vehicle),false);
  assert.equal(eligible({...job,booking_date:'2026-09-26'},date,vehicle),false);
  assert.equal(eligible(job,date,{...vehicle,fleetGroup:'Nissan Pool Cars'}),false);
  assert.equal(eligible(job,date,{...vehicle,registration:'OTHER'}),false);
});

test('subject, key drop wording and red signature are present', () => {
  const content=reminderContent({...job,customer_name:'Pat'});
  assert.equal(content.subject,'NK75BBV Service tomorrow');
  assert.match(content.text,/Hi Pat,/);
  assert.match(content.text,/Key Drop letterbox/);
  assert.match(content.html,/color:#c8102e;font-size:24px/);
  assert.match(content.html,/href="https:\/\/www.vectamotors.co.uk\//);
});

test('cron uses Fleet contact email, sends once and records the result', async () => {
  const {default:handler}=await import('../../api/fleet-nightly-refresh.js');
  const originalFetch=globalThis.fetch;
  const OriginalDate=globalThis.Date;
  const originalEnv={CRON_SECRET:process.env.CRON_SECRET,RESEND_API_KEY:process.env.RESEND_API_KEY,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,VITE_SUPABASE_URL:process.env.VITE_SUPABASE_URL,VERCEL_ENV:process.env.VERCEL_ENV};
  const requestLog=[];
  let reserved=false;
  try {
    globalThis.Date=class extends OriginalDate { constructor(...args){super(...(args.length?args:['2026-09-24T11:00:00.000Z']));} static now(){return OriginalDate.parse('2026-09-24T11:00:00.000Z');} };
    Object.assign(process.env,{CRON_SECRET:'test-secret',RESEND_API_KEY:'fake-test-key',SUPABASE_SERVICE_ROLE_KEY:'fake-db-key',VITE_SUPABASE_URL:'https://test.supabase.co',VERCEL_ENV:'production'});
    globalThis.fetch=async (url,options={}) => {
      requestLog.push({url,options});
      const path=String(url);
      const result=(data,status=200)=>({ok:status<300,status,json:async()=>data});
      if(path.includes('/rest/v1/jobs?'))return result([{...job,customer_email:''}]);
      if(path.includes('/rest/v1/workshop_settings?'))return result([{value:{vehicles:[vehicle]}}]);
      if(path.endsWith('/rest/v1/nmuk_service_reminder_sends') && options.method==='POST') {
        if(reserved)return result({message:'duplicate key value violates unique constraint',code:'23505'},409);
        reserved=true;return result([{id:'one'}],201);
      }
      if(path.includes('/rest/v1/nmuk_service_reminder_sends?') && options.method==='PATCH')return result([]);
      if(path==='https://api.resend.com/emails')return result({id:'sent-test-id'});
      throw Error('Unexpected request: '+path);
    };
    const run=async()=>{
      let status,body;
      await handler({method:'GET',query:{task:'nmuk-summer'},headers:{authorization:'Bearer test-secret'}},{status(code){status=code;return this;},json(value){body=value;return this;}});
      return {status,body};
    };
    assert.deepEqual((await run()).body,{date,eligible:1,sent:1,failures:[]});
    assert.equal((await run()).body.sent,0);
    const sends=requestLog.filter(entry=>entry.url==='https://api.resend.com/emails');
    assert.equal(sends.length,1);
    const email=JSON.parse(sends[0].options.body);
    assert.deepEqual(email.to,['driver@example.com']);
    assert.equal(email.from,'Chris@Nissan-Fleet.co.uk');
    assert.equal(email.subject,'NK75BBV Service tomorrow');
  } finally {
    globalThis.fetch=originalFetch;globalThis.Date=OriginalDate;
    for(const [key,value] of Object.entries(originalEnv)) if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
