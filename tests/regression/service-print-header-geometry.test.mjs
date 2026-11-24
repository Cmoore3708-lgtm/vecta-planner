import test from 'node:test';
import {PDFDocument} from 'pdf-lib';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const chrome=['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
test('Polestar header fits and the completed Peugeot service sheet prints on one A4 page',{skip:!chrome,timeout:30000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'vecta-print-'));
 const shell=readFileSync('index.html','utf8').split('</head>')[0];
 const styles=Array.from(shell.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi),m=>m[0]).join('\n');
 const css=readFileSync('public/js/haynes-service-sheet.css','utf8');
 const previewScript=readFileSync('public/js/vecta-ev-service.js','utf8');
 const source=readFileSync('index.html','utf8');
 const start=source.indexOf('  var ops=inspection?',source.indexOf('async function printService('));
 const end=source.indexOf("  document.getElementById('printSheet').innerHTML=html;await openServicePreview(j)",start);
 assert.ok(start>0&&end>start);
 const render=Function('j','inspection','interimService','kind','esc','dvsaAdvisoryArray','paperworkTitle','serviceSheetSummaryHtml','emailLinkHtml','confirmedJobMileage','serviceSectionTitle',source.slice(start,end)+'return html;');
 const full=render({registration:'WA15TEL',vehicle:'Polestar 2',booking_date:'2026-11-24'},false,false,'service',String,()=>['Engine covers and undertrays fitted obscuring some testable items'],()=>'Service Sheet',()=>'<div class="ssDueSummary"><div><b>MOT due</b><span>02/06/2027</span></div><div><b>Tax due</b><span>DD/MM/YYYY</span></div><div><b>Next service due</b><span>24/11/2027</span></div></div>',()=>'',()=>23022,(_,title)=>'<div class="ssTitle">'+title+'</div>');
 const body=full.slice(full.indexOf('<div class="ssDocumentTitle">'),-6);
 const page=join(dir,'sheet.html');
 writeFileSync(page,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<style>${css}</style>
 <div id="printSheet" class="printSheet"><div class="servicePrint ssHaynesCompact ssHasHaynesVehicle"><div class="ssHeader" style="width:680px!important">
 <div class="ssBrand"><img class="ssWebsiteLogo" alt="VECTA" src="${pathToFileURL(join(process.cwd(),'public/assets/vecta-service-logo.webp'))}"></div>
 <div class="ssPlate"><div class="ssPlateGb">GB</div><div class="ssPlateReg">WA15TEL</div></div>
 <div class="ssHaynesHeaderInfo"><div class="ssInfoRow"><b>Vehicle:</b><span>POLESTAR POLESTAR 2 EV AWD</span></div><div class="ssInfoRow"><b>Mileage:</b><span>23022</span></div><div class="ssInfoRow"><b>Date:</b><span>24/11/2026</span></div></div>
 <img class="ssManufacturerLogo" alt="Polestar" src="${pathToFileURL(join(process.cwd(),'public/assets/manufacturers/polestar.svg'))}"><div class="ssHaynesVehicle"><img alt="Sample vehicle" src="${pathToFileURL(join(process.cwd(),'public/assets/progress/cm14kel-ready.webp'))}"></div></div>${body}</div></div><script>${previewScript}</script><script>${readFileSync("public/js/haynes-service-sheet.js","utf8")}</script>`);
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
   const rows=[...document.querySelectorAll('.ssHaynesHeaderInfo .ssInfoRow')].map(e=>e.getBoundingClientRect());
   const fits=['WA15TEL','WW77 WWW'].map(value=>{const e=q('.ssPlateReg');e.textContent=value;const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),p=box('.ssPlate');return text.left>=box('.ssPlateGb').right&&text.right<=p.right-2;});
   return {fits,gap:plate.left-brand.right,below:info.top>=plate.bottom&&info.top>=badge.bottom,line:Math.max(...rows.map(r=>r.top))-Math.min(...rows.map(r=>r.top)),car:box('.ssHaynesVehicle').width};
  })()`});
  assert.ok(measure.result.value.car>0,'print fixture must be visible');assert.deepEqual(measure.result.value.fits,[true,true],JSON.stringify(measure.result.value));assert.ok(measure.result.value.gap>=10);assert.ok(measure.result.value.below);assert.ok(measure.result.value.line<3);assert.ok(measure.result.value.car>=240);
  await command('Emulation.setEmulatedMedia',{media:'screen'});
  for(const width of [375,390,402,430]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
   const mobile=await command('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
    document.body.classList.add('servicePreviewing');
    document.querySelector('.ssHeader').style.removeProperty('width');
    let bar=document.querySelector('#servicePreviewControls');
    if(!bar){bar=document.createElement('div');bar.id='servicePreviewControls';bar.className='servicePreviewControls';
     bar.innerHTML='<label>Service sheet <select><option>Auto · EV</option></select></label><button>Close</button><button>All Green</button><button>Reset Guide</button><button class="savePreview">Save</button><button class="printPreview">Print</button><div role="status"></div>';document.body.prepend(bar);}
    document.querySelector('.ssPlateReg').textContent='WA15TEL';
    const sheet=document.querySelector('.servicePrint');sheet.dataset.sheetType='service';applyElectricServiceSheet(sheet,{fuel_type:'ELECTRIC'});sizeServicePaper();
    const rect=s=>document.querySelector(s).getBoundingClientRect();
    const car=rect('.ssHaynesVehicle img'),badge=rect('.ssManufacturerLogo'),plate=rect('.ssPlate');
    const buttons=[...bar.querySelectorAll('button')].map(e=>e.getBoundingClientRect());
    const title=rect('.ssDocumentTitle'),header=rect('.ssHeader'),paper=rect('#printSheet'),toolbar=bar.getBoundingClientRect();
    return {edges:Math.abs(header.right-title.right)<2&&Math.abs(header.left-title.left)<2&&Math.abs(car.right-title.right)<2,viewport:Math.abs(paper.width-document.documentElement.clientWidth)<2&&Math.abs(toolbar.width-paper.width)<2&&document.documentElement.scrollWidth<=document.documentElement.clientWidth+2,buttons:buttons.every(b=>b.width>0&&b.height>=44&&b.left>=0&&b.right<=innerWidth),full:bar.scrollWidth<=bar.clientWidth+1,car:car.width,badge:badge.width,separate:plate.right<=car.left+1&&badge.right<=car.left+1,visible:car.right<=innerWidth+1};
   })()`});
   const m=mobile.result.value;assert.ok(m.edges&&m.viewport&&m.buttons&&m.full&&m.visible&&m.separate&&m.badge>=24&&m.car>=119,JSON.stringify({width,...m}));
  }
  // Reopen a saved combustion sheet whose old oil controls sit beside mileage.
  await command('Page.reload',{});
  for(let i=0;i<100;i++){
   const ready=await command('Runtime.evaluate',{expression:"typeof initHaynesServiceSheet==='function'&&!document.body.classList.contains('servicePreviewing')"});
   if(ready.result.value)break;
   await delay(30);
  }
  const setup=await command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
   const sheet=document.querySelector('.servicePrint'),info=sheet.querySelector('.ssHaynesHeaderInfo');
   document.body.classList.add('servicePreviewing');sheet.querySelector('.ssHeader').style.removeProperty('width');
   sheet.dataset.sheetChoice='standard';sheet.dataset.jobId='test-peugeot';
   sheet.querySelector('.ssPlateReg').textContent='CV72JSX';
   info.querySelector('span').textContent='PEUGEOT 208 ACTIVE PREMIUM PURETECH S/S';
   info.children[1].insertAdjacentHTML('afterend','<div class="ssEngineOilSummary"></div><div class="ssJobOilLookup"></div>');
   // Restore the original saved header's three vehicle rows before upgrading it.
   sheet.querySelector('.ssInfo').children[1].replaceWith(info);
   info.classList.remove('ssHaynesHeaderInfo');
   const mileage=info.children[1].querySelector('span');mileage.className='ssMileageEntry';mileage.textContent='22746';
   const logo=sheet.querySelector('.ssWebsiteLogo').src;
   const badge=sheet.querySelector('.ssManufacturerLogo');badge.src=badge.src.replace('polestar.svg','peugeot.svg');
   const customer=sheet.querySelectorAll('.ssInfo>div:first-child .ssInfoRow span');
   ['Sample customer','07700 900123','sample@example.org'].forEach((value,i)=>customer[i].textContent=value);
   const oil={applicability:'Cold and temperate climates (Europe, Azerbaijan, Russia, Canada, Georgia, North Korea, South Korea, Kazakhstan, Mauritius, New Zealand)',specification:'SAE 5W-30 STELLANTIS FPW9.55535/03',capacity:'3.25 L'};
   window.fetch=async url=>({json:async()=>String(url).includes('supabase-config')?{haynesServiceTest:true}:!String(url).includes('haynes=oil')?{status:'OFFLINE'}:{status:'MATCHED',result:{registration:'CV72JSX',selected:0,oil:[oil,oil]}}});
   await initHaynesServiceSheet(sheet,'CV72JSX','service');
   await new Promise(resolve=>setTimeout(resolve,30));
   sheet.querySelector('.ssWebsiteLogo').src=logo;
   await Promise.all([...sheet.querySelectorAll('.ssHeader img')].map(img=>img.decode()));
   sheet.querySelector('.ssScore').textContent='100%';
   for(const tread of sheet.querySelectorAll('.ssTreadDepth'))tread.textContent='5';
   for(const pressure of sheet.querySelectorAll('.ssPressure'))pressure.textContent='33';
   for(const tick of sheet.querySelectorAll('.ssDone .ssCheck,.ssRagDot.green,.ssRoadChecks .ssTickBox'))tick.classList.add('selected');
   sheet.querySelector('.ssHaynesRequiredCheck').click();
   return info.children.length===3&&!sheet.querySelector('.ssOilChoice')&&sheet.querySelector('.ssEngineOilSummary').textContent.includes('3.25 L');
  })()`});assert.equal(setup.result.value,true);
  for(const [width,media] of [[1366,'screen'],[390,'screen'],[794,'print']]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
   await command('Emulation.setEmulatedMedia',{media});
   const checkbox=await command('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
    const required=document.querySelector('.ssHaynesRequiredCheck[aria-checked="true"]');
    const empty=document.querySelector('.ssHaynesRequiredCheck[aria-checked="false"]');
    const completed=required.closest('tr').querySelector('.ssDone .ssCheck.selected');
    const fill=element=>getComputedStyle(element).backgroundColor;
    return fill(required.parentElement)===fill(empty.parentElement)&&fill(required)===fill(completed)&&fill(required)!==fill(empty);
   })()`});
   assert.equal(checkbox.result.value,true,'only the Required checkbox should turn green at '+width+' '+media);
   const bounds=await command('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
    sizeServicePaper();
    const box=s=>document.querySelector(s).getBoundingClientRect();
    const header=box('.ssHeader'),info=box('.ssHaynesHeaderInfo'),oil=box('.ssEngineOilSummary');
    return info.left>=header.left-1&&info.right<=header.right+1&&info.height<55&&header.height<230&&(matchMedia('print').matches?oil.height===0:oil.height>0&&oil.top>=header.bottom-1);
   })()`});assert.ok(bounds.result.value,'Peugeot layout at '+width+' '+media);
  }
  const printed=await command('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
   const visible=s=>document.querySelector(s).getBoundingClientRect().height>0;
   return visible('.ssRoad')&&visible('.ssFooter')&&!visible('.ssOilReference')&&!visible('.ssEngineOilSummary')&&visible('.ssHaynesFluidChecks');
  })()`});
  assert.equal(printed.result.value,true,'print the road test, footer and fluid checks without the oil reference');
  const pdf=await command('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,paperWidth:210/25.4,paperHeight:297/25.4});
  const bytes=Buffer.from(pdf.data,'base64');
  const pdfPages=(await PDFDocument.load(bytes)).getPages();
  assert.equal(pdfPages.length,1,'the completed Peugeot inspection must fit one A4 page');
  assert.ok(Math.abs(pdfPages[0].getWidth()-595)<2&&Math.abs(pdfPages[0].getHeight()-842)<2);
 }finally{socket?.close();proc.kill();await delay(150);rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
});

