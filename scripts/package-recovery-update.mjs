import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function packageRecoveryUpdate(out){
 if(!path.isAbsolute(out)||(await fs.readdir(out).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e))).length)throw Error('Use an empty absolute output folder');
 for(const file of ['lib/worker-runtime.js','workers/control/workshop-workers.ps1','workers/control/supervisor.mjs','workers/control/recovery-update.mjs','workers/control/install-recovery.ps1','workers/control/release-store.mjs','workers/control/release-cli.mjs']){
  const dest=path.join(out,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(repository,file),dest);
 }
 await fs.writeFile(path.join(out,'package.json'),'{"private":true,"type":"module"}\n');
 await fs.writeFile(path.join(out,'START-HERE.cmd'),'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0workers\\control\\install-recovery.ps1"\r\nif errorlevel 1 pause\r\n');
 await fs.writeFile(path.join(out,'READ-ME.txt'),`VECTA AUTOMATIC WORKER RECOVERY UPDATE

One-time installation on the workshop PC:
1. In Workshop Connections, press Stop safely. Wait until the workers stop.
2. Close the Workshop Connections panel.
3. Extract this ZIP, then double-click START-HERE.cmd.

The existing Start VECTA Workers desktop shortcut will reopen the panel.
Confirm one real lookup each for Haynes, tyres and GSF after installation.

This update preserves installed supplier and pricing code, saved settings,
pairing and browser profiles. It replaces only the worker manager and status
writer, and adds a supervisor. Dependencies are copied from your existing
installation; it does not download an old version of your supplier workers.
The previous release is kept. Stop safely, then Restore previous to roll back.

Crashed workers restart automatically with delays between repeated failures.
Persistent connection failures request a safe restart after two minutes.
Missing/stale heartbeats request recovery after 90 seconds. A running worker
must finish and shut down before its replacement starts. No browser is forcibly
killed. If it cannot stop safely, the worker still needs attention.

Login, verification and pairing problems get one session restart; if they recur,
the supplier window remains open for intervention. A restart cannot supply a
password or clear a supplier challenge. Stop safely disables automatic retries.
Recovery continues when only the connection panel is closed. Keep the PC awake.

This is a local update of the installed release. It does not publish a worker
channel or change the Workshop Pro website. Live PC acceptance is still required.
`);
 return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await packageRecoveryUpdate(process.argv[2]));
