import {createHash} from 'node:crypto';
export const REQUIRED_BACKUP_TABLES=['jobs','customers','vehicles','invoices','invoice_lines','workshop_settings','website_booking_requests'];
export function dataChecksum(data){return createHash('sha256').update(JSON.stringify(data)).digest('hex');}
export function validateBackup(backup,{checksum=true}={}){
 if(!backup||backup.format!=='VECTA_WORKSHOP_PRO_FULL_BACKUP_V1'||backup.consistent_snapshot!==true||!backup.data||!backup.counts)throw Error('Unrecognised or inconsistent workshop backup');
 for(const table of REQUIRED_BACKUP_TABLES)if(!Object.hasOwn(backup.data,table))throw Error('Backup is missing '+table);
 let total=0;
 const names=Object.keys(backup.data).sort();
 if(JSON.stringify(names)!==JSON.stringify(Object.keys(backup.counts).sort()))throw Error('Backup table inventory does not match counts');
 for(const table of names){const rows=backup.data[table];if(!Array.isArray(rows)||rows.length!==backup.counts[table])throw Error('Backup count mismatch: '+table);total+=rows.length;}
 if(total!==backup.total_records)throw Error('Backup total does not match table counts');
 if(checksum&&backup.data_sha256!==dataChecksum(backup.data))throw Error('Backup checksum does not match');
 return true;
}
