import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const chrome=['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
test('printed Polestar header fits the registration and keeps the three fields on one line',{skip:!chrome,timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'vecta-print-'));
 const shell=readFileSync('index.html','utf8').split('</head>')[0];
 const styles=Array.from(shell.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi),m=>m[0]).join('\n');
 const css=readFileSync('public/js/haynes-service-sheet.css','utf8');
 const page=join(dir,'sheet.html');
 writeFileSync(page,`<!doctype html><meta charset="utf-8">${styles}<style>${css}</style>
 <div id="printSheet"><div class="servicePrint ssHaynesCompact ssHasHaynesVehicle"><div class="ssHeader" style="width:680px!important">
 <div class="ssBrand"><img class="ssWebsiteLogo" alt="VECTA"></div>
 <div class="ssPlate"><div class="ssPlateGb">GB</div><div class="ssPlateReg">WA15TEL</div></div>
 <div class="ssHaynesHeaderInfo"><div class="ssInfoRow"><b>Vehicle:</b><span>POLESTAR POLESTAR 2 EV AWD</span></div><div class="ssInfoRow"><b>Mileage:</b><span>23022</span></div><div class="ssInfoRow"><b>Date:</b><span>24/11/2026</span></div></div>
 <img class="ssManufacturerLogo" alt="Polestar"><div class="ssHaynesVehicle"><img alt="Polestar 2"></div></div></div></div>`);
 const proc=spawn(chrome,['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+dir,pathToFileURL(page).href],{stdio:'ignore'});
 let socket;
 try{
  const portFile=join(dir,'DevToolsActivePort');
  for(let i=0;!existsSync(portFile)&&i<150;i++)await delay(50);
  const port=readFileSync(portFile,'utf8').split('\n')[0];
  const pages=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.onopen=ok;socket.onerror=fail;});
  let id=0;
  async function command(method,params){
   const seq=++id;
   const result=new Promise((ok,fail)=>{const listener=e=>{const m=JSON.parse(e.data);if(m.id!==seq)return;socket.removeEventListener('message',listener);if(m.error)fail(Error(m.error.message));else ok(m.result);};socket.addEventListener('message',listener);});
   socket.send(JSON.stringify({id:seq,method,params}));return result;
  }
  await command('Emulation.setEmulatedMedia',{media:'print'});
  const measure=await command('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
   const q=s=>document.querySelector(s),box=s=>q(s).getBoundingClientRect();
   const plate=box('.ssPlate'),brand=box('.ssBrand'),badge=box('.ssManufacturerLogo'),info=box('.ssHaynesHeaderInfo');
   const rows=[...document.querySelectorAll('.ssInfoRow')].map(e=>e.getBoundingClientRect());
   const fits=['WA15TEL','WW77 WWW'].map(value=>{const e=q('.ssPlateReg');e.textContent=value;const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),p=box('.ssPlate');return text.left>=box('.ssPlateGb').right&&text.right<=p.right-2;});
   return {fits,gap:plate.left-brand.right,below:info.top>=plate.bottom&&info.top>=badge.bottom,line:Math.max(...rows.map(r=>r.top))-Math.min(...rows.map(r=>r.top)),car:box('.ssHaynesVehicle').width};
  })()`});
  assert.ok(measure.result.value.car>0,'print fixture must be visible');assert.deepEqual(measure.result.value.fits,[true,true],JSON.stringify(measure.result.value));assert.ok(measure.result.value.gap>=10);assert.ok(measure.result.value.below);assert.ok(measure.result.value.line<3);assert.ok(measure.result.value.car>=240);
 }finally{socket?.close();proc.kill();await delay(150);rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
});
