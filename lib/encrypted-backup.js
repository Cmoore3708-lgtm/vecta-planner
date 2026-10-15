import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {validateBackup} from './backup-integrity.js';

const magic=Buffer.from('VECTA-ENCRYPTED-BACKUP-V1\n'),limit=64*1024*1024;
function key(passphrase,salt){
 if(typeof passphrase!=='string'||Buffer.byteLength(passphrase)>4096)throw Error('Invalid recovery passphrase.');
 return scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
export function encryptBackup(backup,passphrase){
 validateBackup(backup);
 if(typeof passphrase!=='string'||passphrase.length<16)throw Error('Use a recovery passphrase of at least 16 characters.');
 const raw=Buffer.from(JSON.stringify(backup));if(raw.length>limit)throw Error('Backup exceeds the supported 64 MiB recovery size.');
 const salt=randomBytes(16),nonce=randomBytes(12),header=Buffer.concat([magic,salt,nonce]),derived=key(passphrase,salt);
 try{const cipher=createCipheriv('aes-256-gcm',derived,nonce);cipher.setAAD(header);const bytes=Buffer.concat([cipher.update(gzipSync(raw)),cipher.final()]);return Buffer.concat([header,cipher.getAuthTag(),bytes]);}
 finally{derived.fill(0);}
}
export function decryptBackup(encrypted,passphrase){
 const bytes=Buffer.from(encrypted),base=magic.length;
 if(bytes.length<base+45||bytes.length>limit||!bytes.subarray(0,base).equals(magic))throw Error('Unrecognised or oversized encrypted backup.');
 const header=bytes.subarray(0,base+28),salt=bytes.subarray(base,base+16),nonce=bytes.subarray(base+16,base+28),derived=key(passphrase,salt);
 try{const decipher=createDecipheriv('aes-256-gcm',derived,nonce);decipher.setAAD(header);decipher.setAuthTag(bytes.subarray(base+28,base+44));const zipped=Buffer.concat([decipher.update(bytes.subarray(base+44)),decipher.final()]);const backup=JSON.parse(gunzipSync(zipped,{maxOutputLength:limit}).toString('utf8'));validateBackup(backup);return backup;}
 catch{throw Error('Recovery verification failed: wrong passphrase, damaged file or invalid backup.');}
 finally{derived.fill(0);}
}
