import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {encryptBackup,decryptBackup} from '../lib/encrypted-backup.js';

// New files only. Verification finishes before publishing; a failed run never
// replaces a previous good recovery copy. No database connection or import.
export function writeVerifiedCopy(destination,bytes,verify){
 const full=path.resolve(destination),temp=full+'.'+randomUUID()+'.partial';
 try{
  fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});
  const fd=fs.openSync(temp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  verify(fs.readFileSync(temp));
  // Exclusive creation prevents accidental overwrite and symlink substitution.
  fs.linkSync(temp,full);
 }finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
export function run(args,stdin=()=>fs.readFileSync(0,'utf8')){
 const [operation,source,...rest]=args;
 let output=null,passwordFile=null,useStdin=false;
 for(let i=0;i<rest.length;i++){
  if(rest[i]==='--output'&&rest[i+1])output=rest[++i];
  else if(rest[i]==='--passphrase-file'&&rest[i+1])passwordFile=rest[++i];
  else if(rest[i]==='--passphrase-stdin')useStdin=true;
  else throw Error('Unknown or incomplete option.');
 }
 if(!['seal','verify','open'].includes(operation)||!source||Boolean(passwordFile)===useStdin||(operation!=='verify'&&!output)||(operation==='verify'&&output))throw Error('Usage: encrypted-workshop-backup.mjs seal|verify|open SOURCE [--output NEW_FILE] --passphrase-stdin|--passphrase-file FILE');
 if(fs.statSync(source).size>64*1024*1024)throw Error('Recovery input exceeds 64 MiB.');
 if(passwordFile&&fs.statSync(passwordFile).size>4096)throw Error('Invalid recovery passphrase file.');
 const passphrase=(useStdin?stdin():fs.readFileSync(passwordFile,'utf8')).replace(/\r?\n$/,'');
 if(Buffer.byteLength(passphrase)>4096)throw Error('Invalid recovery passphrase.');
 const input=fs.readFileSync(source);
 if(operation==='seal'){
  const backup=JSON.parse(input.toString('utf8')),encrypted=encryptBackup(backup,passphrase);
  writeVerifiedCopy(output,encrypted,bytes=>decryptBackup(bytes,passphrase));
  return 'Encrypted copy written and successfully decrypted/validated for verification.';
 }
 const backup=decryptBackup(input,passphrase);
 if(operation==='open')writeVerifiedCopy(output,Buffer.from(JSON.stringify(backup)),bytes=>{
  const restored=JSON.parse(bytes.toString('utf8'));if(JSON.stringify(restored)!==JSON.stringify(backup))throw Error('Recovered copy differs.');
 });
 return `Verified ${Object.keys(backup.data).length} tables and ${backup.total_records} records. This is workshop-data recovery, not complete system recovery.`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(run(process.argv.slice(2)));}catch(error){console.error(error.message);process.exitCode=1;}
}
