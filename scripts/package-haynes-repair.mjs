import {readdir,readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.argv[2]||'haynes-repair-package');
const files=(await readdir(resolve(root,'workers/haynes'))).filter(n=>/\.(?:mjs|cmd|ps1|json)$/.test(n)).map(n=>'workers/haynes/'+n);
files.push('lib/haynes-vehicle.js','lib/haynes-service.js','lib/worker-runtime.js');
const included=new Set(files),manifest=[];
// Fail packaging if any local module import is missing, including re-exports.
for(const file of files){
 const source=await readFile(resolve(root,file));
 if(/\.(?:mjs|js)$/.test(file))for(const match of source.toString().matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)){
  const dependency=relative(root,resolve(dirname(resolve(root,file)),match[1])).replaceAll('\\','/');
  if(!included.has(dependency))throw Error('Missing packaged dependency: '+file+' -> '+dependency);
 }
 const dest=resolve(out,'payload',file);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,source);
 manifest.push({path:file,sha256:createHash('sha256').update(source).digest('hex')});
}
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2));
await copyFile(resolve(root,'workers/haynes/windows-update-menus.ps1'),resolve(out,'repair.ps1'));
await writeFile(resolve(out,'REPAIR-HAYNES.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0repair.ps1"\r\n');
await writeFile(resolve(out,'START-HERE.txt'),'VECTA HAYNES WORKER REPAIR - 19 OCTOBER 2026\r\n\r\n1. Download this ZIP to the workshop PC and choose Extract All.\r\n2. Open the extracted folder and double-click REPAIR-HAYNES.cmd.\r\n3. Close the old Haynes black worker windows, then press Enter in the repair window.\r\n4. The repair restores the required worker files, checks that the modules load, and starts the worker.\r\n5. Refresh Workshop Pro and retry the lookup.\r\n\r\nThe saved login, Edge profile and pairing are kept. Existing code files are backed up.\r\nIf asked, select the existing worker folder containing relay.mjs and windows-connect.cmd.\r\nThis repair includes the large-menu fix. Normal conditions is selected automatically by Workshop Pro.\r\nIf any check fails, take a photo of the error. The repair restores previous code files when installation fails.\r\n');
console.log(JSON.stringify({directory:out,files:files.length,dependencies:'complete'}));
