import test from 'node:test';
import assert from 'node:assert/strict';
import {shortenInvoiceUrl} from '../../api/_invoice-pdf.js';
const original='https://workshop.example/invoice?token=signed-token';
test('TinyURL receives the exact signed URL; validates returned URL and falls back on all failures',async()=>{
 const old=globalThis.fetch;
 try {
  let called;
  globalThis.fetch=async (url,options)=>{called={url,options};return new Response('https://tinyurl.com/abc123')};
  assert.equal(await shortenInvoiceUrl(original),'https://tinyurl.com/abc123');
  assert.equal(new URL(called.url).searchParams.get('url'),original);assert.equal(called.options.redirect,'error');assert.ok(called.options.signal);
  for(const value of ['Error','https://attacker.example/x','http://tinyurl.com/x','https://tinyurl.com.evil.example/x','https://user@tinyurl.com/x','https://tinyurl.com/x?redirect=evil','https://tinyurl.com/x#evil','https://tinyurl.com/']){
   globalThis.fetch=async()=>new Response(value);assert.equal(await shortenInvoiceUrl(original),original);
  }
  globalThis.fetch=async()=>new Response('Rate limited',{status:429});assert.equal(await shortenInvoiceUrl(original),original);
  globalThis.fetch=async()=>{throw Error('timeout')};assert.equal(await shortenInvoiceUrl(original),original);
 }finally{globalThis.fetch=old}
});
