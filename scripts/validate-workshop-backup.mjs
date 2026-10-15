import {readFileSync} from 'node:fs';
import {validateBackup} from '../lib/backup-integrity.js';
const path=process.argv[2];
if(!path)throw Error('Usage: node scripts/validate-workshop-backup.mjs PATH');
const backup=JSON.parse(readFileSync(path,'utf8'));validateBackup(backup);
console.log('Verified '+Object.keys(backup.data).length+' tables, '+backup.total_records+' records; SHA-256 matches.');
console.log('Scope: workshop data and financial audit. Schema, Auth, Storage, hosting configuration and other projects need separate recovery copies.');
