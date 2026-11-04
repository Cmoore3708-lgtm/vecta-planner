import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const output=path.resolve(process.argv[2]||'VECTA-Service-Kit-Update.zip');
const files=Object.fromEntries(['install.mjs','install.ps1','release-store.mjs','release-cli.mjs'].map(name=>[name,path.resolve('scripts/service-kit-update',name)]));
for(const name of ['service-kit.mjs','live-service.mjs'])files['workers/gsf/'+name]=path.resolve('workers/gsf',name);
for(const source of Object.values(files))fs.accessSync(source);
const readme=`VECTA SERVICE KIT UPDATE - DIAGNOSTIC CONNECTION REPAIR

1. In Workshop Connections, press Stop safely and wait for the workers to stop.
2. Close the Workshop Connections panel.
3. Extract All from this ZIP, then double-click START-HERE.cmd.
4. Start the workers when the panel reopens, then tell ChatGPT it is installed.

The recovery update stopped passing the existing diagnostic pairing to GSF.
This repair reconnects the diagnostic bridge so the actual H16CKK failure can
be traced remotely. It does not claim the missing price is fixed. It does not
start another 100-vehicle test or change your pricing calculations.

This update uses GSF Service Kit first and verifies each selected product's
current ex-VAT price. Existing markup, labour and rounding remain unchanged.
Oil bottle size is not engine capacity; an unconfirmed fill still needs review.
The previous category lookup remains available as a fallback.

The Service Kit reader is retained and one GSF diagnostic connection condition
is repaired. Current Haynes, tyre and automatic-recovery code is copied from
your installed version. Settings, sign-ins and supplier
profiles are retained. Nothing is ordered. A previous release is kept for rollback.

Offline regression tests passed. The Service Kit screen still needs live PC
verification; the screenshot is not proof that the reader works on the live DOM.
Do not treat the existing GBP160 preset as a new GSF quote unless the job card
explicitly reports a current GSF service price or labelled guide price.
`;
const script=`import json,sys,zipfile\nfrom pathlib import Path\nd=json.load(sys.stdin)\np=Path(d['output']);p.parent.mkdir(parents=True,exist_ok=True)\nwith zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:\n for name,source in d['files'].items():z.write(source,name)\n z.writestr('READ-ME.txt',d['readme'])\n z.writestr('START-HERE.cmd','@echo off\\r\\ncd /d "%~dp0"\\r\\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"\\r\\npause\\r\\n')\nwith zipfile.ZipFile(p) as z:assert z.testzip() is None\nprint(json.dumps({'output':str(p),'bytes':p.stat().st_size}))`;
const result=spawnSync('python3',['-c',script],{input:JSON.stringify({output,files,readme}),encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr||'Packaging failed');
console.log(result.stdout.trim());
