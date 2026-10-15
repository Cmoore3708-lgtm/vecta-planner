import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareHistoricalArchive} from '../../scripts/prepare-historical-archive.mjs';
import {datasetNames,auditHistoricalImports} from '../../scripts/audit-historical-imports.mjs';
function source(){return Object.fromEntries(datasetNames.map(name=>[name,name.endsWith('FINANCIAL_HISTORY')?{'2025':{daily:{'2025-01-01':120}}}:[{id:name,description:"Synthetic customer's work",amount_quoted:120}]]));}
function html(data){return datasetNames.map(name=>'window.'+name+'='+JSON.stringify(data[name])+';').join('\n');}
test('private archive preparation checks every reviewed source fingerprint and preserves apostrophes safely',()=>{
 const data=source(),baseline=auditHistoricalImports(data,data),result=prepareHistoricalArchive(html(data),baseline,'a'.repeat(40));
 assert.equal(result.summary.datasetCount,8);assert.equal(result.summary.retirementReady,false);assert.match(result.sql,/Synthetic customer''s work/);
 assert.equal((result.sql.match(/on conflict\(dataset_name,source_sha256\) do nothing/g)||[]).length,8);
 assert.match(result.sql,/payload=expected/);assert.doesNotMatch(result.sql,/delete from|update public|insert into public\.jobs/i);
});
test('changed historical source cannot be archived against an unchanged baseline',()=>{
 const data=source(),baseline=auditHistoricalImports(data,data);data.NMUK_2026_JOBS[0].amount_quoted=999;
 assert.throws(()=>prepareHistoricalArchive(html(data),baseline,'a'.repeat(40)),/differs from the reviewed baseline/);
 assert.throws(()=>prepareHistoricalArchive(html(source()),baseline,'main'),/exact source commit/);
});
test('protected archives remain private, append-only for the service and part of backup/restore coverage',()=>{
 const sql=fs.readFileSync('scripts/sql/protected-historical-archive.sql','utf8');
 assert.match(sql,/revoke all on schema vecta_history from public,anon,authenticated/);
 assert.match(sql,/enable row level security/);assert.match(sql,/grant select,insert on vecta_history.source_datasets to service_role/);
 assert.doesNotMatch(sql,/security definer|grant.*to (anon|authenticated)/i);
 assert.match(sql,/in \('public','vecta_audit','vecta_history'\)/);
 assert.match(fs.readFileSync('tests/database/backup-restore.sql','utf8'),/vecta_history/);
});
