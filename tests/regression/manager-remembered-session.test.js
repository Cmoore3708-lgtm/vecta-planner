import test from 'node:test';
import assert from 'node:assert/strict';
import middleware,{managerSessionCookie,validManagerSession} from '../../middleware.js';
const credentials={user:'Manager',password:'test-secret-not-a-real-password'};
const now=Date.parse('2026-10-01T15:00:00Z');
const request=cookie=>new Request('https://workshop.test/',{headers:{cookie}});

test('remembered session lasts 30 days and contains no password',async()=>{
 const cookie=await managerSessionCookie(credentials,now);
 assert.match(cookie,/Max-Age=2592000; Secure; HttpOnly; SameSite=Strict/);
 assert.ok(!cookie.includes(credentials.password));
 assert.equal(await validManagerSession(request(cookie),credentials,now+29*86400000),true);
 assert.equal(await validManagerSession(request(cookie),credentials,now+30*86400000),false);
});
test('tampering, wrong password, wrong user and malformed cookies fail closed',async()=>{
 const cookie=await managerSessionCookie(credentials,now);
 assert.equal(await validManagerSession(request(cookie.replace('v1.','v2.')),credentials,now),false);
 assert.equal(await validManagerSession(request(cookie),{...credentials,password:'changed'},now),false);
 assert.equal(await validManagerSession(request(cookie),{...credentials,user:'Other'},now),false);
 assert.equal(await validManagerSession(request(cookie+'; '+cookie),credentials,now),false);
 assert.equal(await validManagerSession(request('__Host-vecta-manager=garbage'),credentials,now),false);
});
test('valid remembered phone bypasses password prompt and renews session',async()=>{
 const previous={user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
 process.env.VECTA_MAIN_USER=credentials.user;process.env.VECTA_MAIN_PASSWORD=credentials.password;
 try{
   const cookie=await managerSessionCookie(credentials);
   const response=await middleware(request(cookie));
   assert.equal(response.headers.get('X-Vecta-Manager-Authenticated'),'1');
   assert.match(response.headers.get('set-cookie'),/Max-Age=2592000/);
   assert.equal(response.headers.get('www-authenticate'),null);
   assert.equal((await middleware(request(''))).status,401);
 }finally{
   for(const [key,value] of [['VECTA_MAIN_USER',previous.user],['VECTA_MAIN_PASSWORD',previous.password]]){
     if(value===undefined)delete process.env[key];else process.env[key]=value;
   }
 }
});
