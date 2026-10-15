import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const datasetNames=['CONTRACTOR_2026_JOBS','NMUK_2026_JOBS','CONTRACTOR_2026_NEW_VEHICLES','INITIAL_FLEET_VEHICLES','INITIAL_MAINTENANCE_PLANS','HISTORICAL_COMPLETION_SEED','CONTRACTOR_FINANCIAL_HISTORY','NMUK_FINANCIAL_HISTORY'];

function literalAt(source,start){
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<source.length;i++){
  const char=source[i];
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
  if(char==='"'){quoted=true;continue;}
  if(char==='['||char==='{')depth++;
  if((char===']'||char==='}')&&--depth===0)return JSON.parse(source.slice(start,i+1));
 }
 throw Error('Incomplete historical source literal');
}
export function readHistoricalSource(source){
 const datasets={};
 for(const name of datasetNames){
  const match=new RegExp('(?:window\\.)?'+name+'\\s*=\\s*([\\[{])').exec(source);
  if(!match)throw Error('Missing historical dataset: '+name);
  datasets[name]=literalAt(source,match.index+match[0].length-1);
 }
 return datasets;
}
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
function fingerprint(value){return crypto.createHash('sha256').update(canonical(value)).digest('hex');}
export function auditHistoricalImports(datasets,protectedCopy=null){
 const summaries={},issues=[];
 for(const name of datasetNames){
  const data=datasets[name];if(!data||typeof data!=='object')throw Error('Invalid historical dataset: '+name);
  const entries=Array.isArray(data)?data:null,ids=entries?.filter(row=>row.id!=null).map(row=>String(row.id))||[];
  const duplicateIds=ids.length-new Set(ids).size;
  const copy=protectedCopy?.[name];
  summaries[name]={entries:entries?entries.length:Object.keys(data).length,sha256:fingerprint(data),bytes:Buffer.byteLength(canonical(data)),duplicateIds,copyMatches:copy!=null&&fingerprint(copy)===fingerprint(data)};
  if(duplicateIds)issues.push(name+': duplicate IDs');
  if(!summaries[name].copyMatches)issues.push(name+': protected copy absent or different');
 }
 const rows=[...datasets.CONTRACTOR_2026_JOBS,...datasets.NMUK_2026_JOBS];
 const legacyIds=rows.filter(row=>!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(row.id||''))).length;
 const fullServiceReview=rows.filter(row=>/\bFULL SERVICE\b/i.test(row.work_required||'')&&!/\bMAJOR SERVICE\b/i.test(row.work_required||''));
 return {sourceRecords:rows.length,legacyIds,protectedCopyMatches:issues.length===0,datasets:summaries,issues,fullServiceClassificationReviewCount:fullServiceReview.length,
  retirementReady:false,remainingChecks:['Verify protected-store permissions and complete snapshot coverage','Reconcile current jobs, invoice links, finance corrections and report totals','Verify offline history and cold-start behaviour before retiring imports']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);if(args.length>2)throw Error('Usage: node scripts/audit-historical-imports.mjs [index.html] [protected-history.json]');
  const source=readHistoricalSource(fs.readFileSync(args[0]||'index.html','utf8'));
  const result=auditHistoricalImports(source,args[1]?JSON.parse(fs.readFileSync(args[1],'utf8')):null);
  console.log(JSON.stringify(result,null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
