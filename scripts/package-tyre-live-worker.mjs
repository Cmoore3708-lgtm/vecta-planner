import fs from 'node:fs';import path from 'node:path';
const target=process.argv[2];if(!target||!path.isAbsolute(target))throw Error('Provide an absolute empty output folder');
fs.mkdirSync(target,{recursive:true});if(fs.readdirSync(target).length)throw Error('Output folder must be empty');
const names=['live-worker.mjs','setup-auto-sign-in.ps1','session-recovery.mjs','save-login.ps1','read-login.ps1','AUTO-SIGN-IN.md','browser.mjs','esp-search.mjs','esp-dom.mjs','esp-enquiry.mjs','esp-normalise.mjs','esp-settings.mjs','guide.mjs','start-live.ps1','package.json','package-lock.json'];
for(const name of names){const dest=path.join(target,'workers/tyres',name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync('workers/tyres/'+name,dest)}
fs.mkdirSync(path.join(target,'lib'));fs.copyFileSync('lib/tyre-relay-contract.js',path.join(target,'lib/tyre-relay-contract.js'));
fs.writeFileSync(path.join(target,'package.json'),'{"private":true,"type":"module"}\n');
fs.writeFileSync(path.join(target,'START-LIVE-TYRE-PRICES.cmd'),'@echo off\r\nsetlocal\r\ncd /d "%~dp0workers\\tyres"\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0workers\\tyres\\start-live.ps1"\r\npause\r\n');
fs.copyFileSync('workers/tyres/AUTO-SIGN-IN-SETUP.txt',path.join(target,'READ-ME-FIRST.txt'));console.log('Prepared complete tyre worker package');

fs.copyFileSync('SETUP-AUTO-SIGN-IN.cmd',path.join(target,'SETUP-AUTO-SIGN-IN.cmd'));
