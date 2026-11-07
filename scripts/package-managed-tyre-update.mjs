import fs from 'node:fs/promises';
import path from 'node:path';

const destination=process.argv[2];
if(!destination||!path.isAbsolute(destination))throw Error('Supply an absolute output directory');
await fs.mkdir(destination,{recursive:true});
if((await fs.readdir(destination)).length)throw Error('Use an empty output directory');
const folder='workers/tyres';
for(const name of ['APPLY-REPAIR.cmd','CHECK-FIRST.cmd','SAVE-ESP-LOGIN.cmd','README.txt','workshop-pc.ps1','read-esp-login.ps1','patch-release.mjs']){
 const source=path.join(folder,'managed-update',name);
 if(name.endsWith('.cmd')){
  const text=await fs.readFile(source,'utf8');
  await fs.writeFile(path.join(destination,name),text.replace(/\r?\n/g,'\r\n'));
 }else await fs.copyFile(source,path.join(destination,name));
}
for(const name of ['session-recovery.mjs','managed-session.mjs','save-supplier-login.ps1']){
 await fs.copyFile(path.join(folder,name),path.join(destination,name));
}

if(process.argv.includes('--with-gsf')){
 for(const name of ['workers/gsf/worker.mjs','workers/gsf/quote-delivery.mjs','workers/repair-quotes/shared-bridge.mjs']){
  await fs.copyFile(name,path.join(destination,path.basename(name)));
 }
 const launcher=path.join(destination,'APPLY-REPAIR.cmd');
 const cmd=await fs.readFile(launcher,'utf8');
 await fs.writeFile(launcher,cmd.replace(' -Repair',' -Repair -IncludeGsf'));
 const readme=path.join(destination,'README.txt');
 const previous=await fs.readFile(readme,'utf8');
 await fs.writeFile(readme,'VECTA | Combined GSF and tyre worker update\n\nRun CHECK-FIRST, then stop the workers safely and run APPLY-REPAIR as below. This bundle also installs GSF result delivery before tab cleanup for repair and service quotes. It preserves GSF catalogue data and existing sign-ins. After installation verify one GSF service lookup and one repair quote as well as the tyre check.\n\n'+previous.replace('and preserves the existing Haynes and GSF files','and preserves existing Haynes files and GSF catalogue/settings'));
}
