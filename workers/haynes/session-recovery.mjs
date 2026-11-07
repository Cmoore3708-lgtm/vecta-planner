import fs from 'node:fs';
import path from 'node:path';
import {readVehicle} from './dom.mjs';
import {HaynesError} from '../../lib/haynes-vehicle.js';

const origin='https://www.workshopdata.com';
const start=origin+'/touch/site/layout/makesOverview';

// The record contains no account details. A failed or interrupted attempt stays
// blocked across restarts until SAVE-HAYNES-LOGIN is run again.
export function loginAttemptStore(file) {
 function locked(action) {
  let fd;
  try {
   fs.mkdirSync(path.dirname(file),{recursive:true});
   fd=fs.openSync(file+'.lock','wx',0o600);
   return action();
  } catch { return false; }
  finally {if(fd!==undefined){fs.closeSync(fd);fs.rmSync(file+'.lock',{force:true});}}
 }
 const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const write=value=>{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,file);};
 return {
  reserve(at,cooldown){return locked(()=>{
   const previous=read();
   if(previous && (previous.blocked!==false || !Number.isFinite(previous.at) || at-previous.at<cooldown))return false;
   write({at,blocked:true});return true;
  });},
  confirmed(at){return locked(()=>{const previous=read();if(previous?.at!==at)return false;write({at,blocked:false});return true;});}
 };
}

export function createHaynesSessionRecovery({username='',password='',attempts,now=Date.now,cooldownMs=30*60*1000}={}) {
 let pending=null;
 const sameOrigin=page=>{try{return new URL(page.url()).origin===origin;}catch{return false;}};
 async function inspect(page){
  if(!sameOrigin(page))throw new HaynesError('LOGIN_REQUIRED');
  const data=await page.evaluate(readVehicle);
  if(data.blocked)throw new HaynesError('VERIFICATION_REQUIRED');
  return data;
 }
 async function signIn(page){
  // Scope the controls to the observed supplier form, not a page-wide password
  // field. Never submit through a changed form action or a second-factor page.
  const form=page.locator('form[action="/touch/site/layout/wsdLogin"][method="POST"]').filter({has:page.locator('input#password[name="password"]')});
  const user=form.locator('input#username[name="username"]');
  const pass=form.locator('input#password[name="password"][type="password"]');
  const submit=form.locator('input[type="submit"][name="submit"]');
  if(await form.count()!==1 || await user.count()!==1 || await pass.count()!==1 || await submit.count()!==1 || !await user.isVisible() || !await pass.isVisible())throw new HaynesError('LOGIN_REQUIRED');
  if(await page.locator('input[autocomplete="one-time-code"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"]').count())throw new HaynesError('VERIFICATION_REQUIRED');
  await inspect(page);
  const at=now();
  if(!attempts?.reserve(at,cooldownMs))throw new HaynesError('LOGIN_REQUIRED');
  try {
   await user.fill(username,{timeout:3000});await pass.fill(password,{timeout:3000});
   if(!sameOrigin(page))throw new HaynesError('LOGIN_REQUIRED');
   await submit.click({timeout:6000});
   await page.locator('#numberPlate,input[name="numberPlate"]').waitFor({state:'visible',timeout:10000});
   const data=await inspect(page);
   if(data.login)throw new HaynesError('LOGIN_REQUIRED');
   attempts.confirmed(at);return data;
  } catch(error) {
   // Never include browser error text that could echo credentials or form values.
   if(error instanceof HaynesError)throw error;
   await inspect(page).catch(problem=>{if(problem.code==='VERIFICATION_REQUIRED')throw problem;});
   throw new HaynesError('LOGIN_REQUIRED');
  }
 }
 return {async ensure(page){
  const data=await inspect(page);
  if(!data.login)return data;
  if(pending){await pending;await page.goto(start,{waitUntil:'domcontentloaded',timeout:10000});const restored=await inspect(page);if(restored.login)throw new HaynesError('LOGIN_REQUIRED');return restored;}
  if(!username||!password)throw new HaynesError('LOGIN_REQUIRED');
  pending=signIn(page);
  try{return await pending;}finally{pending=null;}
 }};
}

let shared;
export async function ensureHaynesSession(page) {
 if(!shared){
  const {HAYNES_USERNAME:username,HAYNES_PASSWORD:password,LOCALAPPDATA:local}=process.env;
  delete process.env.HAYNES_USERNAME;delete process.env.HAYNES_PASSWORD;
  shared=createHaynesSessionRecovery({username,password,attempts:local?loginAttemptStore(path.join(local,'VectaHaynes','login-attempt.json')):undefined});
 }
 return shared.ensure(page);
}
