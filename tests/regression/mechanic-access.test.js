import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mechanicAuthorised,mechanicCookie,mechanicGate} from '../../lib/mechanic-auth.js';
import {managerGate,validManagerSession,managerSessionCookie} from '../../middleware.js';
import {createMechanicHandler,MECHANIC_FIELDS} from '../../lib/mechanic-jobs.js';
import configHandler from '../../api/supabase-config.js';

const credentials={user:'mechanic',password:'test-only-mechanic-password'};
const manager={user:'manager',password:'different-manager-password'};
const basic=c=>'Basic '+Buffer.from(c.user+':'+c.password).toString('base64');
const response=()=>({code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}});
const id='12345678-1234-1234-1234-123456789012';
const stamp='2026-10-17T07:00:00.000Z';
const row={id,updated_at:stamp,booking_date:'2026-10-17',registration:'TEST',status:'booked',amount_quoted:900,customer_email:'private@example.test',technician_notes:'Existing work'};
const req=overrides=>({method:'GET',headers:{host:'workshop.test',authorization:basic(credentials)},query:{date:'2026-10-17'},...overrides});
async function withEnv(run) {
  const before=[process.env.VECTA_MECHANIC_USER,process.env.VECTA_MECHANIC_PASSWORD];
  process.env.VECTA_MECHANIC_USER=credentials.user;process.env.VECTA_MECHANIC_PASSWORD=credentials.password;
  try{return await run();}finally{for(const [i,k] of ['VECTA_MECHANIC_USER','VECTA_MECHANIC_PASSWORD'].entries()){if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];}}
}
function handler(request) {return createMechanicHandler({request,environment:()=>({url:'https://test.supabase.co',serviceKey:'server-only-secret'})});}
test('mechanics and Main reject each other’s Basic credentials and signed cookies',async()=>{
 const mechRequest=new Request('https://workshop.test/index.html',{headers:{authorization:basic(credentials)}});
 assert.equal(managerGate(mechRequest,manager).status,401);
 assert.equal(await mechanicAuthorised(new Request('https://workshop.test/',{headers:{authorization:basic(manager)}}),credentials),false);
 const mechCookie=await mechanicCookie(credentials);
 assert.equal(await validManagerSession(new Request('https://workshop.test/',{headers:{cookie:mechCookie}}),manager),false);
 assert.equal(await mechanicAuthorised(new Request('https://workshop.test/',{headers:{cookie:await managerSessionCookie(manager)}}),credentials),false);
 assert.equal(await mechanicAuthorised(new Request('https://workshop.test/',{headers:{cookie:mechCookie}}),credentials),true);
});
test('mechanic sessions reject tampering, expiry, duplicate cookies and password rotation',async()=>{
 const now=Date.now(),cookie=await mechanicCookie(credentials,now);
 const request=c=>new Request('https://test/',{headers:{cookie:c}});
 assert.equal(await mechanicAuthorised(request(cookie.replace('v1.','v2.')),credentials,now),false);
 assert.equal(await mechanicAuthorised(request(cookie+'; '+cookie),credentials,now),false);
 assert.equal(await mechanicAuthorised(request(cookie),credentials,now+31*86400000),false);
 assert.equal(await mechanicAuthorised(request(cookie),{...credentials,password:'rotated'},now),false);
 assert.equal((await mechanicGate(request(''),{})).status,503);
 assert.equal((await mechanicGate(request(''),credentials)).headers.get('WWW-Authenticate'),'Basic realm="VECTA Mechanics", charset="UTF-8"');
});
test('anonymous and Main-only clients never reach the mechanics database',()=>withEnv(async()=>{
 let called=0;const api=handler(async()=>{called++;throw Error('Should not query');});
 for(const authorization of ['',basic(manager),'Basic !!!']){const res=response();await api(req({headers:{authorization}}),res);assert.equal(res.code,401);}
 assert.equal(called,0);
}));
test('existing server function dispatches the mechanic route without issuing Main sessions',()=>withEnv(async()=>{
 const res=response();await configHandler(req({query:{action:'mechanic',date:'2026-10-17'},headers:{authorization:basic(manager)}}),res);
 assert.equal(res.code,401);assert.equal(res.body.access_token,undefined);
 assert.equal(fs.existsSync('api/mechanic.js'),false);
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.equal(config.rewrites.find(r=>r.source==='/api/mechanic').destination,'/api/supabase-config?action=mechanic');
}));
test('jobs reads select permitted columns and strip unexpected database fields',()=>withEnv(async()=>{
 let called=0;
 const api=handler(async(url,init)=>{called++;assert.equal(url.pathname,'/rest/v1/jobs');assert.equal(url.searchParams.get('select'),MECHANIC_FIELDS.join(','));assert.equal(url.searchParams.get('booking_date'),'eq.2026-10-17');assert.equal(url.searchParams.get('completed_at'),'is.null');assert.equal(url.searchParams.get('archived'),'not.is.true');assert.equal(init.headers.Authorization,'Bearer server-only-secret');return Response.json([row]);});
 const res=response();await api(req(),res);assert.equal(res.code,200);assert.equal(res.body.jobs[0].amount_quoted,undefined);assert.equal(res.body.jobs[0].customer_email,undefined);assert.equal(JSON.stringify(res.body).includes('secret'),false);assert.equal(called,1);
 for(const query of [{date:'2026-02-30'},{date:'2026-10-17',select:'*'},{date:['2026-10-17']},{table:'invoices'}]){const res=response();await api(req({query}),res);assert.equal(res.code,400);}
 assert.equal(called,1);
}));
function write(body,extra={}) {return req({method:'PATCH',query:{},headers:{host:'workshop.test',origin:'https://workshop.test',authorization:basic(credentials),'x-vecta-mechanic':'1'},body:{id,updated_at:stamp,technician_notes:'Changed notes',...body},...extra});}
test('saves use optimistic concurrency and update only notes, start status and timestamp',()=>withEnv(async()=>{
 const api=handler(async(url,init)=>{assert.equal(url.searchParams.get('id'),'eq.'+id);assert.equal(url.searchParams.get('updated_at'),'eq.'+stamp);assert.match(url.searchParams.get('status'),/booked/);assert.equal(init.method,'PATCH');const patch=JSON.parse(init.body);assert.deepEqual(Object.keys(patch).sort(),['status','technician_notes','updated_at']);assert.equal(patch.status,'in_progress');return Response.json([{...row,...patch}]);});
 const res=response();await api(write({status:'in_progress'}),res);assert.equal(res.code,200);assert.equal(res.body.jobs[0].status,'in_progress');
 const stale=response();await handler(async()=>Response.json([]))(write({}),stale);assert.equal(stale.code,409);
}));
test('mechanics cannot change prices, allocation, completion, invoices or cross-site data',()=>withEnv(async()=>{
 let calls=0;const api=handler(async()=>{calls++;throw Error('Must not query');});
 for(const body of [{amount_quoted:0},{status:'completed'},{status:'ready_to_invoice'},{technician:'Anyone'},{completed_at:stamp},{technician_notes:'x'.repeat(10001)},{id:'x&select=*'}]){const res=response();await api(write(body),res);assert.equal(res.code,400);}
 for(const changes of [{origin:'https://attacker.test'},{origin:undefined},{'x-vecta-mechanic':''},{'sec-fetch-site':'cross-site'}]){const request=write({});request.headers={...request.headers,...changes};const res=response();await api(request,res);assert.equal(res.code,403);}
 assert.equal(calls,0);
}));
test('database failures do not disclose secrets or raw database messages',()=>withEnv(async()=>{
 const res=response();await handler(async()=>new Response('private database error',{status:500}))(req(),res);assert.equal(res.code,503);assert.doesNotMatch(JSON.stringify(res.body),/private|secret/);
}));
test('mechanics proxy cannot forward arbitrary Main, finance or session routes',()=>{
 const config=JSON.parse(fs.readFileSync('deploy/mechanic-access/vercel.json','utf8'));
 assert.deepEqual(config.rewrites.map(r=>r.source),['/','/mechanic.html','/api/mechanic','/api/supabase-config','/js/mechanic-app.js','/js/mechanic-app.css']);
 const probe=config.rewrites.find(r=>r.source==='/api/supabase-config');assert.equal(probe.has[0].value,'release');assert.match(probe.destination,/\?action=release$/);
 const source=fs.readFileSync('public/js/mechanic-app.js','utf8');assert.doesNotMatch(source,/innerHTML|localStorage|supabase|amount_quoted/);assert.match(source,/beforeunload/);
});
