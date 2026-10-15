import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {encryptBackup,decryptBackup} from '../../lib/encrypted-backup.js';
import {dataChecksum,REQUIRED_BACKUP_TABLES} from '../../lib/backup-integrity.js';
import {run,writeVerifiedCopy} from '../../scripts/encrypted-workshop-backup.mjs';
const password='Synthetic recovery passphrase only';
function fixture(){const data=Object.fromEntries(REQUIRED_BACKUP_TABLES.map(t=>[t,[]]));data.invoices=[{id:'synthetic',total:120,lines:[{description:'Synthetic £ work "quoted"'}]}];return {format:'VECTA_WORKSHOP_PRO_FULL_BACKUP_V1',consistent_snapshot:true,data,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),total_records:1,data_sha256:dataChecksum(data)};}
test('encrypted recovery roundtrip preserves every table and rejects wrong passwords and tampering',()=>{
 const b=fixture(),sealed=encryptBackup(b,password);assert.deepEqual(decryptBackup(sealed,password),b);assert.equal(sealed.includes(Buffer.from('synthetic')),false);
 assert.notDeepEqual(encryptBackup(b,password),sealed);
 assert.throws(()=>decryptBackup(sealed,'Wrong password'),/verification failed/);
 for(const offset of [0,26,45,sealed.length-1]){const damaged=Buffer.from(sealed);damaged[offset]^=1;assert.throws(()=>decryptBackup(damaged,password));}
 assert.throws(()=>encryptBackup(b,'short'),/16 characters/);
});
test('an invalid or partial backup cannot be sealed as a successful recovery copy',()=>{
 const b=fixture();delete b.data.jobs;assert.throws(()=>encryptBackup(b,password),/missing jobs/);
});
test('seal, verify and open roundtrip without overwriting or deleting the original',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-recovery-'));
 try{const source=path.join(folder,'source.json'),sealed=path.join(folder,'copy.vecta-encrypted'),restored=path.join(folder,'restored.json');fs.writeFileSync(source,JSON.stringify(fixture()));
 assert.match(run(['seal',source,'--output',sealed,'--passphrase-stdin'],()=>password+'\n'),/Encrypted copy/);
 assert.match(run(['verify',sealed,'--passphrase-stdin'],()=>password),/1 records/);
 assert.throws(()=>run(['seal',source,'--output',sealed,'--passphrase-stdin'],()=>password),/exist/i);
 assert.throws(()=>run(['open',sealed,'--output',restored,'--passphrase-stdin'],()=>'Wrong'),/verification failed/);assert.equal(fs.existsSync(restored),false);
 run(['open',sealed,'--output',restored,'--passphrase-stdin'],()=>password);assert.deepEqual(JSON.parse(fs.readFileSync(restored)),fixture());assert.equal(fs.existsSync(source),true);
 assert.equal(fs.readdirSync(folder).some(n=>n.endsWith('.partial')),false);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('failed verification never publishes a destination or replaces a prior good copy',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-recovery-'));
 try{const dest=path.join(folder,'copy');assert.throws(()=>writeVerifiedCopy(dest,Buffer.from('bad'),()=>{throw Error('bad verification');}),/bad verification/);assert.equal(fs.existsSync(dest),false);assert.deepEqual(fs.readdirSync(folder),[]);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
