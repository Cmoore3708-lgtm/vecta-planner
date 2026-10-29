import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function addBatchFiles(bundle,repo){
 const files=new Map(bundle.files.map(file=>[file.path,Buffer.from(file.content,'base64')]));
 let source=files.get('workers/gsf/worker.mjs')?.toString();
 if(!source||!source.includes('const state=await repair.tick();')||!source.includes('await sleep(2000);\n    }'))throw Error('Unsupported worker release; no changes made');
 if(source.includes('./batch-connection.mjs'))throw Error('Batch connection is already installed');
 source="import {createDiagnosticBridge} from './diagnostic-bridge.mjs';\nimport {batchConnection} from './batch-connection.mjs';\n"+source;
 source=source.replace('let repair=null;',`let repair=null,diagnostics=null,diagnosticHeartbeat=null,batch=null;
try{batch=batchConnection();if(batch)diagnostics=createDiagnosticBridge({context,ready:true,outboxPath:batch.outboxPath,rpc:batch.rpc,log:console.log});}catch{console.log('Batch test connection needs attention; normal customer requests can continue.');}
async function batchTick(){if(diagnostics){try{await diagnostics.tick();}catch{console.log('Batch progress is saved. Retrying the test connection.');}}}
async function batchHeartbeat(){if(diagnostics){try{if(await diagnostics.heartbeat())await batch.start();}catch{}}}
`);
 source=source.replace("    while(!stopped", "    await batchHeartbeat();\n    diagnosticHeartbeat=setInterval(()=>{void batchHeartbeat();},20000);diagnosticHeartbeat.unref?.();\n    while(!stopped");
 source=source.replace("      if(repair){try{", "      let repairIdle=!repair;\n      if(repair){try{");
 source=source.replace("const state=await repair.tick();", "const state=await repair.tick();repairIdle=['IDLE','DISABLED'].includes(state);");
 source=source.replace("if(!serviceEnabled){await sleep(2000);continue;}", "if(!serviceEnabled){if(repairIdle)await batchTick();await sleep(2000);continue;}");
 source=source.replace("      await sleep(2000);\n    }", "      if(task.status==='IDLE'&&repairIdle)await batchTick();\n      await sleep(2000);\n    }");
 source=source.replace("} finally {await repair?.close();", "} finally {clearInterval(diagnosticHeartbeat);await repair?.close();");
 files.set('workers/gsf/worker.mjs',Buffer.from(source));
 for(const name of ['diagnostic-bridge.mjs','diagnostic-case.mjs','diagnostic-product.mjs'])files.set('workers/gsf/'+name,readFileSync(path.join(repo,'workers/gsf',name)));
 files.set('workers/gsf/batch-connection.mjs',readFileSync(path.join(repo,'scripts/batch-test-update/connection.mjs')));
 files.set('lib/worker-tests.js',readFileSync(path.join(repo,'lib/worker-tests.js')));
 // GSF uses the same existing Windows-encrypted pairing, now also for private
 // diagnostic evidence. It is never packaged or sent back to the assistant.
 const control='workers/control/workshop-workers.ps1';let manager=files.get(control).toString();
 manager=manager.replace("if ($Worker -ne 'GSF') {", "if ($true) { # Paired identity is also used by GSF diagnostics.");files.set(control,Buffer.from(manager));
 const records=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([name,bytes])=>({path:name,size:bytes.length,sha256:sha(bytes),content:bytes.toString('base64')}));
 const version=createHash('sha1').update(JSON.stringify(records)).digest('hex');
 return {format:1,version,files:records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [input,output,repo]=process.argv.slice(2),bundle=addBatchFiles(JSON.parse(gunzipSync(readFileSync(input))),repo);
 mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,gzipSync(Buffer.from(JSON.stringify(bundle))));console.log(JSON.stringify({version:bundle.version,files:bundle.files.length,output}));
}
