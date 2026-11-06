import fs from 'node:fs';
import path from 'node:path';
import {createSessionRecovery} from './session-recovery.mjs';
import {ensureEnquiry} from './esp-enquiry.mjs';
import {readEspSettings,requireEspSettings} from './esp-settings.mjs';

// Persist only a timestamp so a supervisor restart cannot reset the retry limit.
// An unreadable existing record disables automatic submission until it is fixed.
export function reserveLoginAttempt(file,at,interval){
 try{
  let last;
  try{last=Number(fs.readFileSync(file,'utf8'));}catch(error){if(error.code!=='ENOENT')return false;}
  if(last!==undefined&&(!Number.isFinite(last)||at-last<interval))return false;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temporary,String(at),{mode:0o600});
  fs.renameSync(temporary,file);
  return true;
 }catch{return false;}
}
export function managedSession(supplier,runtime,env=process.env){
 const file=path.join(env.LOCALAPPDATA,'VectaTyres','last-sign-in-at.txt');
 const recovery=createSessionRecovery({supplier,username:env.ESP_USERNAME,password:env.ESP_PASSWORD,
  reserveAttempt:(at,interval)=>reserveLoginAttempt(file,at,interval)});
 let nextCheck=0;
 return {ensure:recovery.ensure,async inspect(page){
  if(Date.now()<nextCheck)return;
  nextCheck=Date.now()+60000;
  try{
   // Keep the operator's login page intact while they type or complete verification.
   await recovery.ensure(page,{keepLoginPage:true});await ensureEnquiry(page);
   requireEspSettings(await page.evaluate(source=>(new Function('return ('+source+')')())(document),readEspSettings.toString()));
   runtime.set('connected','STARTUP_CONFIRMED');
  }catch(error){
   const reason=/LOGIN_REQUIRED/.test(error.message)?'LOGIN_REQUIRED':
    /SETTINGS_NOT_VERIFIED/.test(error.message)?'SETTINGS_REQUIRED':'CONNECTION_UNAVAILABLE';
   runtime.set(reason==='CONNECTION_UNAVAILABLE'?'reconnecting':'attention',reason);
  }
 }};
}
