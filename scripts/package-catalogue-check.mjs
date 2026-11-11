import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root=path.resolve(new URL('../',import.meta.url).pathname),stage=fs.mkdtempSync(path.join(os.tmpdir(),'vecta-catalogue-check-'));
const included=new Set();
function copy(relative){
 if(included.has(relative))return;included.add(relative);
 const source=fs.readFileSync(path.join(root,relative),'utf8');
 fs.mkdirSync(path.dirname(path.join(stage,relative)),{recursive:true});fs.writeFileSync(path.join(stage,relative),source);
 for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))copy(path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[1])));
}
copy('workers/repair-quotes/check-catalogue.mjs');
copy('workers/repair-quotes/check-haynes-search.mjs');
for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,'workers/repair-quotes',file),path.join(stage,'workers/repair-quotes',file));
fs.writeFileSync(path.join(stage,'package.json'),'{"private":true,"type":"module"}\n');
fs.writeFileSync(path.join(stage,'CHECK-PRICING.cmd'),'@echo off\r\ncd /d "%~dp0workers\\repair-quotes"\r\nif not exist node_modules\\playwright\\package.json call npm ci --ignore-scripts\r\nif errorlevel 1 goto end\r\nnode check-catalogue.mjs\r\n:end\r\npause\r\n');
fs.writeFileSync(path.join(stage,'CHECK-LABOUR.cmd'),'@echo off\r\ncd /d "%~dp0workers\\repair-quotes"\r\nif not exist node_modules\\playwright\\package.json call npm ci --ignore-scripts\r\nif errorlevel 1 goto end\r\nnode check-haynes-search.mjs\r\n:end\r\npause\r\n');
fs.writeFileSync(path.join(stage,'READ-ME.txt'),'VECTA — GENERAL PARTS PRICING CHECK — v13\r\n\r\nHAYNES ONLY: Run CHECK-LABOUR.cmd to check any repair in Haynes without repeating GSF. GSF can keep running. Close any earlier repair-test Haynes window first. Send workers/repair-quotes/haynes-search-result.local.json back afterwards. This check never calculates a supplied-and-fitted quote.\r\n\r\nFULL CHECK:\r\nThis is a read-only test, not a worker installation.\r\n\r\n1. Stop GSF safely in Workshop Connections.\r\n2. Extract All and open CHECK-PRICING.cmd. Enter the registration and repair. Choose the GSF part first, then its Haynes fitting operation. Priced out-of-stock parts are included and labelled; confirm supply separately.\r\n3. If a supplier step fails, its window stays open. For GSF, select the vehicle and part manually. For Haynes, open the repair group and fitting operation manually. Then press Enter in the checker to record that screen. This extra capture is diagnostic only.\r\n4. Restart GSF after closing the checker.\r\n\r\nThe check uses the existing GSF and repair-Haynes Edge sign-ins. It never orders parts, changes the installed workers, saves a job or sends a customer quote.\r\n\r\nSend catalogue-check-result.local.json (inside workers/repair-quotes) back to the chat. You can enter different search wording at either stage. A failed check records the point that needs work; it is not replaced with a guessed price. You can run it for different parts without another package.\r\n');
const output=path.resolve(process.argv[2]||'/tmp/VECTA-General-Parts-Pricing-Check.zip');execFileSync('zip',['-qr',output,'.'],{cwd:stage});
console.log(JSON.stringify({output,files:included.size}));
