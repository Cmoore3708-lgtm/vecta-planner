import {mkdirSync,existsSync,readFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {spawnSync} from 'node:child_process';

const destination=resolve(process.argv[2]||'Vecta-GSF-PC-Price-Check.zip');
mkdirSync(resolve(destination,'..'),{recursive:true});
const names=['README.md','CHECK-GSF-PRICES.cmd','COMPARE-TEN-CARS.cmd','SIGN-IN-GSF.cmd','START-GSF-PRICING.cmd',
  'setup.cmd','readiness.mjs','probe.mjs','worker.mjs','supplier.mjs','product-dialog.mjs','self-check.mjs',
  'comparison.mjs','compare.mjs','comparison-input.example.json','gsf-config.example.json','pricing-policy.example.json',
  'recipe.template.json','package.json','package-lock.json'];
// Follow runtime relative imports so a clean package never misses new helpers.
const included=new Set(names.map(name=>'workers/gsf/'+name).concat('lib/service-pricing.js'));
for(const file of included){
 if(!/\.(mjs|js)$/.test(file))continue;
 const source=readFileSync(file,'utf8');
 for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)){
  const dependency=relative(process.cwd(),resolve(dirname(file),match[1])).replaceAll('\\','/');
  if(dependency.startsWith('../')||dependency.endsWith('.local.json'))throw Error('Unsafe package dependency: '+dependency);
  included.add(dependency);
 }
}
const files=[...included];
for(const file of files)if(!existsSync(file))throw Error('Missing package file: '+file);
const wrapper='@echo off\r\ncd /d "%~dp0"\r\ncall "workers\\gsf\\setup.cmd"\r\n';
const comparison='@echo off\r\ncd /d "%~dp0workers\\gsf"\r\nnode compare.mjs\r\npause\r\n';
const manual='@echo off\r\ncd /d "%~dp0workers\\gsf"\r\nnode probe.mjs --manual\r\npause\r\n';
const readme=`VECTA — GSF PC PRICE CHECK\n\n
Extract All, then double-click START-HERE.cmd. Close any existing GSF worker first.\n
Setup checks Node.js 22+, Microsoft Edge and the local profile folder, installs pinned dependencies, and runs an offline calculation check.\n
It then opens GSF in a separate Edge profile. Sign in directly if needed and press Enter in the terminal. The test filter is found automatically; you do not need to search for it. Both the full product page and the Part Details popup are supported.\n
If automatic searching fails, double-click MANUAL-PRICE-CHECK.cmd, search UFI23.265.00 in the Edge window it opens and click the filter. Leave the full product page or Part Details popup open, then press Enter in the black window.\n
The account price, VAT and stock are checked. A successful check saves selected product fields to workers/gsf/gsf-product-capture.local.json. A failed check saves a small diagnostic file where possible. Login data, cookies and page HTML are not included.\n
The trial rule is 50% markup on parts/oil, plus GBP 35 / 70 / 110 net labour, then 20% VAT. Synthetic offline examples demonstrate the calculation and are not registration-specific quotes.\n
Nothing is ordered and website pricing is not activated.\n
COMPARE-TEN-CARS.cmd is prepared for the later comparison. It needs ten chosen registrations and approved parts/oil mappings first; it cannot generate genuine prices from missing data. The initial template contains four observed registrations and six empty slots.\n
Full technical instructions are in workers/gsf/README.md. This Windows package has been checked offline; the live workshop-PC test is still required.\n`;
const script=String.raw`import json,sys,zipfile
from pathlib import Path
data=json.load(sys.stdin)
with zipfile.ZipFile(data['destination'],'w',zipfile.ZIP_DEFLATED) as archive:
 for name in data['files']:
  path=Path(name)
  content=path.read_bytes()
  if path.suffix=='.cmd':content=path.read_text().replace('\r\n','\n').replace('\n','\r\n').encode('utf8')
  archive.writestr(name,content)
 for name,content in data['extras'].items():archive.writestr(name,content)
with zipfile.ZipFile(data['destination']) as archive:
 assert archive.testzip() is None
 print(json.dumps({'file':data['destination'],'files':len(archive.namelist()),'bytes':Path(data['destination']).stat().st_size}))
`;
const result=spawnSync('python3',['-c',script],{input:JSON.stringify({destination,files,extras:{'START-HERE.cmd':wrapper,'CHECK-GSF-PRICES.cmd':wrapper,'MANUAL-PRICE-CHECK.cmd':manual,'COMPARE-TEN-CARS.cmd':comparison,'READ-ME-FIRST.txt':readme}}),encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr||'Package creation failed');
console.log(result.stdout.trim());
