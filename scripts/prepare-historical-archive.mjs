import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {readHistoricalSource,auditHistoricalImports,datasetNames} from './audit-historical-imports.mjs';

function literal(value){return "'"+String(value).replaceAll("'","''")+"'";}
export function prepareHistoricalArchive(source,baseline,commit){
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Supply the exact source commit.');
 const datasets=readHistoricalSource(source),audit=auditHistoricalImports(datasets,datasets);
 for(const name of datasetNames){const expected=baseline[name]||baseline.datasets?.[name],actual=audit.datasets[name];
  if(!expected||actual.sha256!==expected.sha256||actual.entries!==expected.entries||actual.duplicateIds)throw Error('Historical source differs from the reviewed baseline: '+name);
 }
 const statements=['begin;','set local lock_timeout = \'5s\';'];
 for(const name of datasetNames){
  const summary=audit.datasets[name],json=JSON.stringify(datasets[name]),tag='$archive_'+summary.sha256+'$';
  if(json.includes(tag))throw Error('Unsafe archive delimiter.');
  statements.push(`do ${tag}
declare expected jsonb:=${literal(json)}::jsonb;
begin
 insert into vecta_history.source_datasets(dataset_name,source_sha256,source_commit,entry_count,payload)
 values(${literal(name)},${literal(summary.sha256)},${literal(commit)},${summary.entries},expected)
 on conflict(dataset_name,source_sha256) do nothing;
 if not exists(select 1 from vecta_history.source_datasets where dataset_name=${literal(name)} and source_sha256=${literal(summary.sha256)} and entry_count=${summary.entries} and payload=expected) then
  raise exception 'Protected archive differs from reviewed source: ${name}';
 end if;
end;${tag};`);
 }
 statements.push('commit;');
 return {sql:statements.join('\n'),summary:{datasetCount:datasetNames.length,sourceRecords:audit.sourceRecords,retirementReady:false,datasets:audit.datasets}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [source,baseline,commit,output,...extra]=process.argv.slice(2);if(!output||extra.length)throw Error('Usage: prepare-historical-archive.mjs SOURCE BASELINE EXACT_COMMIT PRIVATE_OUTPUT_SQL');
  const result=prepareHistoricalArchive(fs.readFileSync(source,'utf8'),JSON.parse(fs.readFileSync(baseline,'utf8')),commit);
  fs.writeFileSync(output,result.sql,{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result.summary,null,2));console.log('Private archive SQL written. Do not commit it. This does not permit source retirement.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
