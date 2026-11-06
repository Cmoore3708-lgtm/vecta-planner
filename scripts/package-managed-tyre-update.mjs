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
