import {Writable} from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/full-backup.js';
import {dataChecksum,validateBackup,REQUIRED_BACKUP_TABLES} from '../../lib/backup-integrity.js';
function snapshot(){const data=Object.fromEntries(REQUIRED_BACKUP_TABLES.map(t=>[t,[]]));Object.assign(data,{'invoice_customer_links':[{id:'link',token:'test-token'}],'website_content':[{id:'site',content:'Published copy'}],'website_content_history':[],'nmuk_service_reminder_sends':[],'workshop_push_subscriptions':[],'vecta_audit.financial_revisions':[{id:'audit',amount:100}]});const counts=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]));return {data,counts,total_records:Object.values(counts).reduce((a,b)=>a+b),consistent_snapshot:true,scope:'workshop-data-and-financial-audit',schema_included:false}}
function backup(){const b={...snapshot(),format:'VECTA_WORKSHOP_PRO_FULL_BACKUP_V1'};b.data_sha256=dataChecksum(b.data);return b}
test('roundtrip export preserves invoice links, published content and audit records',()=>{const b=JSON.parse(JSON.stringify(backup()));assert.equal(validateBackup(b),true);assert.equal(b.data.invoice_customer_links[0].token,'test-token');assert.equal(b.data.website_content[0].content,'Published copy');assert.equal(b.data['vecta_audit.financial_revisions'][0].amount,100);});
test('partial and corrupted exports fail validation',()=>{
 let b=backup();delete b.data.jobs;assert.throws(()=>validateBackup(b),/missing jobs/);
 b=backup();b.counts.invoices=5;assert.throws(()=>validateBackup(b),/count mismatch/);
 b=backup();b.total_records++;assert.throws(()=>validateBackup(b),/total/);
 b=backup();b.data.website_content[0].content='Changed';assert.throws(()=>validateBackup(b),/checksum/);
 b=backup();b.consistent_snapshot=false;assert.throws(()=>validateBackup(b),/inconsistent/);
});
test('backup uses a single snapshot RPC and never accepts a partial optional-table export',async()=>{
 const oldFetch=global.fetch,oldEnv={...process.env};Object.assign(process.env,{VERCEL_ENV:'production',VITE_SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test',CRON_SECRET:'cron-test'});let calls=0;
 global.fetch=async(url,options)=>{calls++;assert.equal(new URL(url).pathname,'/rest/v1/rpc/vecta_export_workshop_backup');assert.equal(options.method,'POST');return new Response(JSON.stringify(snapshot()))};
 const res=()=>{
  const r=Object.assign(new Writable({write(chunk,encoding,done){this.parts.push(Buffer.from(chunk));done();}}),{parts:[],setHeader(){},status(n){this.code=n;return this},json(v){this.errorBody=v;return this}});
  Object.defineProperty(r,'body',{get(){return this.errorBody||JSON.parse(Buffer.concat(this.parts).toString('utf8'))}});return r;
 };
 try{let r=res();await handler({method:'GET',headers:{authorization:'Bearer cron-test'}},r);assert.equal(r.code,200);assert.equal(calls,1);assert.equal(validateBackup(r.body),true);assert.equal(r.body.schema_included,false);
 r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.code,401);assert.equal(calls,1);
 global.fetch=async()=>new Response('Missing function',{status:404});r=res();await handler({method:'GET',headers:{authorization:'Bearer cron-test'}},r);assert.equal(r.code,500);
 }finally{global.fetch=oldFetch;process.env=oldEnv}
});
test('large backups stream past 4.5 MB without truncation, with backpressure and a matching checksum',async()=>{
 const {streamBackup}=await import('../../lib/stream-backup.js');const b=backup();b.data.website_content[0].content='£ test { brace } "quote" \\ slash '.repeat(210000);b.data_sha256=dataChecksum(b.data);const parts=[];
 const out=Object.assign(new Writable({highWaterMark:1024,write(chunk,encoding,done){parts.push(Buffer.from(chunk));setImmediate(done);}}),{status(n){assert.equal(n,200)}});
 await streamBackup(out,b);const bytes=Buffer.concat(parts);assert.ok(bytes.length>4500000);assert.ok(parts.length>70);assert.equal(validateBackup(JSON.parse(bytes.toString('utf8'))),true);
});
