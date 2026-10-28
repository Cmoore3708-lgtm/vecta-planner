import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
const files=['oil-capacity.mjs','live-service.mjs','product-dialog.mjs'];
export function applyOilFix(target,payload){
 const worker=path.join(target,'workers','gsf');
 for(const name of ['worker.mjs','live-service.mjs','service-capture.mjs','product-dialog.mjs'])if(!existsSync(path.join(worker,name)))throw Error('Choose the existing Vecta-Live-Repair-Quotes folder containing workers/gsf, not the update folder.');
 const manifest=JSON.parse(readFileSync(path.join(payload,'manifest.json'),'utf8'));
 for(const name of files){const bytes=readFileSync(path.join(payload,name));if(createHash('sha256').update(bytes).digest('hex')!==manifest[name])throw Error('Update checksum failed: '+name);const check=spawnSync(process.execPath,['--check',path.join(payload,name)],{encoding:'utf8'});if(check.status!==0)throw Error('Update syntax check failed: '+name);}
 const backup=path.join(worker,'oil-capacity-backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(backup,{recursive:true});
 const original=new Map(files.map(name=>[name,existsSync(path.join(worker,name))?readFileSync(path.join(worker,name)):null]));
 for(const[name,bytes]of original)if(bytes)writeFileSync(path.join(backup,name),bytes);
 try{
  for(const name of files)copyFileSync(path.join(payload,name),path.join(worker,name));
  const check=spawnSync(process.execPath,['--input-type=module','--eval','await import('+JSON.stringify(pathToFileURL(path.join(worker,'live-service.mjs')).href)+');'],{encoding:'utf8',timeout:15000});
  if(check.status!==0)throw Error('Installed modules could not load. Original files have been restored.');
 }catch(error){for(const[name,bytes]of original){if(bytes)writeFileSync(path.join(worker,name),bytes);else rmSync(path.join(worker,name),{force:true});}throw error;}
 return {worker,backup};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const terminal=createInterface({input:process.stdin,output:process.stdout});
 try{
  console.log('VECTA service lookup fix. Close only the shared GSF/service worker first. Leave Haynes and tyres running.');
  const suggested=path.join(os.homedir(),'Downloads','Vecta-Live-Repair-Quotes (11)');
  console.log('Default existing folder: '+suggested);
  const answer=(await terminal.question('Press Enter for that folder, or paste a different existing worker folder: ')).trim().replace(/^"|"$/g,'');
  const result=applyOilFix(path.resolve(answer||suggested),path.join(path.dirname(fileURLToPath(import.meta.url)),'payload'));
  console.log('UPDATE INSTALLED. Existing settings and sign-in profiles were retained.');
  console.log('Backup: '+result.backup);
  console.log('Restart your existing START-LIVE-SERVICE-PRICING from the original worker folder, then retry G4WPC on the website.');
 }catch(error){console.error('UPDATE NOT INSTALLED: '+error.message);process.exitCode=1;}finally{terminal.close();}
}
