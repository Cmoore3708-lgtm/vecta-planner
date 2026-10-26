import {execFileSync} from 'node:child_process';
import {mkdirSync,cpSync,mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=path.resolve(new URL('../',import.meta.url).pathname),stage=mkdtempSync(path.join(tmpdir(),'vecta-repair-quotes-'));
for(const name of readdirSync(path.join(root,'workers/repair-quotes'))){
 if(name==='node_modules'||name==='profile'||name.endsWith('.local.json'))continue;
 cpSync(path.join(root,'workers/repair-quotes',name),path.join(stage,'workers/repair-quotes',name),{recursive:true});
}
for(const name of readdirSync(path.join(root,'workers/gsf'))){
 if(name==='node_modules'||name==='profile'||name.endsWith('.local.json'))continue;
 cpSync(path.join(root,'workers/gsf',name),path.join(stage,'workers/gsf',name),{recursive:true});
}
mkdirSync(path.join(stage,'workers/haynes'),{recursive:true});cpSync(path.join(root,'workers/haynes/dom.mjs'),path.join(stage,'workers/haynes/dom.mjs'));
mkdirSync(path.join(stage,'lib'),{recursive:true});cpSync(path.join(root,'lib/repair-quote.js'),path.join(stage,'lib/repair-quote.js'));
cpSync(path.join(root,'lib/service-pricing.js'),path.join(stage,'lib/service-pricing.js'));
cpSync(path.join(root,'docs/REPAIR-QUOTE-LOOKUP.md'),path.join(stage,'READ-ME.md'));
cpSync(path.join(root,'workers/repair-quotes/FINISH-REPAIR-SETUP.cmd'),path.join(stage,'FINISH-REPAIR-SETUP.cmd'));
// The root launcher forwards into the worker folder; no file hunting required.
import {writeFileSync} from 'node:fs';
writeFileSync(path.join(stage,'FINISH-REPAIR-SETUP.cmd'),'@echo off\r\ncall "%~dp0workers\\repair-quotes\\FINISH-REPAIR-SETUP.cmd"\r\n');
writeFileSync(path.join(stage,'RETRY-HAYNES.cmd'),'@echo off\r\ncall "%~dp0workers\\repair-quotes\\RETRY-HAYNES.cmd"\r\n');
writeFileSync(path.join(stage,'CHECK-GSF-CATALOGUE.cmd'),'@echo off\r\ncall "%~dp0workers\\repair-quotes\\CHECK-GSF-CATALOGUE.cmd"\r\n');
writeFileSync(path.join(stage,'VERIFY-QUOTE.cmd'),'@echo off\r\ncall "%~dp0workers\\repair-quotes\\VERIFY-QUOTE.cmd"\r\n');
const output=path.resolve(process.argv[2]||'/tmp/Vecta-Repair-Quote-Worker.zip');
execFileSync('zip',['-qr',output,'.'],{cwd:stage});console.log(output);
