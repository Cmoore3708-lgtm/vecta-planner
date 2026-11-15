import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import middleware,{managerGate} from '../../middleware.js';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';

test('mechanics shortcuts use their own icon and manifest, including legacy installed URLs',async()=>{
 for(const host of ['vecta-mechanic-dashboard.vercel.app','vecta-mechanic-dashboard-vectaplanner.vercel.app']){
  for(const path of ['/manifest.webmanifest','/apple-touch-icon.png','/apple-touch-icon-precomposed.png','/favicon.ico','/icons/vecta-192.png?v=old']){
   const result=await middleware(new Request('https://'+host+path));
   assert.equal(result.status,200);
   const target=new URL(result.headers.get('x-middleware-rewrite'));
   assert.equal(target.hostname,host);
   assert.ok(target.pathname.startsWith('/icons/mechanic/'));
   assert.ok(existsSync('public'+target.pathname));
   assert.equal(result.headers.get('Set-Cookie'),null);
   assert.equal(result.headers.get('X-Vecta-Manager-Authenticated'),null);
  }
 }
 const main=await middleware(new Request('https://vecta-planner.vercel.app/manifest.webmanifest'));
 assert.equal(main.headers.get('x-middleware-rewrite'),null);
});

test('public icon handling does not authorise private pages or similarly named routes',async()=>{
 const credentials={user:'manager',password:'test-only'};
 for(const path of ['/','/index.html','/mechanic.html','/favicon.ico/private','/apple-touch-icon.png/private','/icons/../index.html']){
  const mainRequest=new Request('https://vecta-planner.vercel.app'+path);
  assert.equal(managerGate(mainRequest,credentials).status,401);
  const mechanic=await middleware(new Request('https://vecta-mechanic-dashboard.vercel.app'+path));
  assert.ok([401,503].includes(mechanic.status));
  assert.equal(mechanic.headers.get('x-middleware-rewrite'),null);
 }
});

test('website and mechanics metadata resolves to valid files with distinct artwork',()=>{
 const main=readFileSync('index.html','utf8');
 const mechanic=mechanicVariant(main);
 const {document}=parseHTML(mechanic);
 const touch=document.querySelector('link[rel="apple-touch-icon"]');
 assert.equal(touch.getAttribute('href'),'/icons/mechanic/v-180-20261115.png');
 assert.equal(document.querySelector('meta[name="apple-mobile-web-app-title"]').content,'VECTA Mechanics');
 const manifest=JSON.parse(readFileSync('public'+document.querySelector('link[rel="manifest"]').getAttribute('href')));
 assert.equal(manifest.name,'VECTA Mechanics');
 for(const icon of manifest.icons){assert.ok(existsSync('public'+icon.src));assert.match(icon.src,/\/icons\/mechanic\//);}
 for(const [html,root] of [[mechanic,'public'],[readFileSync('website/index.html','utf8'),'website']]){
  const {document}=parseHTML(html);
  for(const link of document.querySelectorAll('link[rel*="icon"]')){
   const url=new URL(link.getAttribute('href'),'https://test.invalid');
   assert.equal(url.search,'','Use new filenames to avoid an old icon URL');
   assert.ok(existsSync(root+url.pathname),url.pathname);
  }
 }
 assert.notDeepEqual(readFileSync('public/icons/mechanic/v-180-20261115.png'),readFileSync('public/icons/vecta-180.png'));
 const ico=readFileSync('website/favicon.ico');
 assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
 assert.deepEqual([ico[6],ico[22],ico[38]],[16,32,48]);
});
