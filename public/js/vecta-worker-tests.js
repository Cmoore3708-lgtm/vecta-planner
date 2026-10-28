(()=>{
 'use strict';
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),uuid=v=>/^[a-f0-9-]{36}$/.test(v||'');
 let runId=uuid(params.get('run'))?params.get('run'):null,busy=false,timer=null;
 const names={service:'Service validation',oil:'Engine oil',oil_filter:'Oil filter',air_filter:'Air filter',cabin_filter:'Cabin filter',fuel_filter:'Fuel filter'};
 const messages={WORKER_OFFLINE:['Diagnostic worker is not connected','The repaired GSF worker must be installed and running on the workshop PC. Any saved progress is retained.'],WORKER_CONFIGURATION_REQUIRED:['The worker needs its diagnostic update','The online connection alone is not enough. The worker must support diagnostics and use the approved vehicle catalogue.'],TEST_STORAGE_UNAVAILABLE:['Test storage is not ready','The diagnostic database setup or connection needs completing before a test can start.'],INSUFFICIENT_REGISTRATIONS:['Not enough eligible registrations','No batch was started. The selected database needs 100 distinct genuine vehicle registrations.'],DISABLED:['GSF service pricing is disabled','The connected deployment must have its GSF worker enabled.'],LOGIN_REQUIRED:['Supplier sign-in has expired','Progress is saved. Sign into GSF on the workshop PC, then resume this test.'],WORKER_BUILD_CHANGED:['Worker version changed during the test','End this run, then retest its saved vehicles on the new worker build.'],SUPPLIER_UNAVAILABLE:['Supplier is temporarily unavailable','Progress is saved. Resume once the supplier connection is working again.'],SUPPLIER_THROTTLED:['Supplier requests are temporarily limited','Progress is saved. Resume after the supplier is available.']};
 async function request(body,query=''){
  const response=await fetch('/api/worker-tests'+query,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json','X-Vecta-Worker-Tests':'1'}:{},...(body?{body:JSON.stringify(body)}:{})});
  if(response.status===401||response.status===403)throw Error('Workshop manager sign-in is required. Open the workshop and sign in, then reopen this link.');
  let data;try{data=await response.json();}catch{throw Error('The diagnostic endpoint is not available on this deployment.');}
  if(!response.ok&&!data.status)throw Error('The test connection is temporarily unavailable.');return data;
 }
 function notice(status,detail){const message=messages[status]||[status.replaceAll('_',' ').toLowerCase(),detail||'No new checks have been started.'];$('state').textContent=status.replaceAll('_',' ');$('message').textContent=message[0];$('detail').textContent=detail||message[1];}
 function follow(id){runId=id;const url=new URL(location.href);url.search='?run='+id;history.replaceState(null,'',url);}
 function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
 function render(data){
  if(!data.run){if(data.status==='NO_RUN'){notice('READY','No saved test yet. Start when the diagnostic worker is connected.');$('message').textContent='Ready for the first test';$('start').hidden=false;}else notice(data.status);return;}
  const {run,counts}=data;follow(run.id);$('results').hidden=false;$('progress-wrap').hidden=false;$('start').hidden=true;
  $('state').textContent=run.status;$('build').textContent='Worker '+run.build.slice(0,12);
  const completed=counts.passed+counts.review+counts.failed+counts.skipped,total=data.cases.length;
  $('progress').max=total;$('progress').value=completed;$('progress-label').textContent=completed+' of '+total+' checks completed';$('vehicles').textContent=data.registrationsCompleted+' of '+run.cohort.length+' vehicles completed';
  $('message').textContent=run.status==='COMPLETED'?'Every scheduled check is recorded':run.status==='RUNNING'?'The test is running':run.status==='PAUSED'?'Your progress is saved':'Test ended · partial results saved';
  $('detail').textContent=run.status==='RUNNING'?'The PC continues working even when this page is closed. Customer requests take priority between checks.':run.reason?(messages[run.reason]?.[1]||run.reason.replaceAll('_',' ')):'Review the shared failure patterns before preparing an update.';
  for(const key of ['passed','review','failed','skipped'])$(key).textContent=counts[key];
  $('summary').textContent='Per-check results · '+counts.working+' in progress';
  $('pause').hidden=run.status!=='RUNNING';$('resume').hidden=run.status!=='PAUSED';$('cancel').hidden=!['RUNNING','PAUSED'].includes(run.status);$('rerun').hidden=!['COMPLETED','CANCELLED'].includes(run.status);$('rerun').href='?start=100&previous='+encodeURIComponent(run.id);
  const groups=document.createDocumentFragment();
  for(const group of data.groups){
   const block=element('details',undefined,'group'),summary=element('summary');summary.append(element('strong',(names[group.operation]||group.operation)+' · '+group.reason.replaceAll('_',' ').toLowerCase()),element('span',group.registrations.length+' vehicles · '+group.stage));block.append(summary,element('p',group.registrations.join(' · ')));
   for(const id of group.caseIds){const row=data.cases.find(x=>x.id===id),item=element('details');item.append(element('summary',row.registration+' · evidence'),element('pre',JSON.stringify(row.evidence,null,2)));block.append(item);}groups.append(block);
  }
  if(!data.groups.length)groups.append(element('p',completed?'No failure patterns recorded so far.':'Failure patterns appear as checks finish.'));
  $('groups').replaceChildren(groups);
  const rows=document.createDocumentFragment();for(const row of data.cases){const tr=element('tr');for(const value of [row.registration,names[row.operation],row.status.replaceAll('_',' '),row.reason||'—'])tr.append(element('td',value));tr.children[2].className='result-'+row.status.toLowerCase();rows.append(tr);}$('cases').replaceChildren(rows);
  $('comparison').hidden=!data.changes;$('changes').replaceChildren(...(data.changes||[]).map(row=>element('p',row.registration+' · '+names[row.operation]+': '+row.before+' → '+row.after+(row.regression?' · REGRESSION':''))));
  if(data.changes&&!data.changes.length)$('changes').append(element('p','No changed completed outcomes yet.'));
 }
 async function refresh(){if(busy)return;try{render(await request(null,runId?'?id='+encodeURIComponent(runId):''));}catch(error){$('detail').textContent=error.message;}}
 async function start(){
  busy=true;
  try{
   const previous=params.get('previous');
   if(previous&&!uuid(previous))throw Error('The saved run link is invalid.');
   const storageKey='vecta-diagnostic-launch:'+location.pathname+':'+(previous||params.get('start'));
   let launchKey;try{launchKey=sessionStorage.getItem(storageKey);if(!uuid(launchKey)){launchKey=crypto.randomUUID();sessionStorage.setItem(storageKey,launchKey);}}catch{throw Error('Browser session storage is unavailable. Enable it before starting, so repeated clicks cannot create duplicate tests.');}
   const data=await request({action:'start',launchKey,count:params.get('start')==='2'?2:100,...(previous?{previousRun:previous}:{})});
   if(data.id){follow(data.id);busy=false;await refresh();}else{notice(data.status,data.available!==undefined?'Only '+data.available+' eligible registrations are available. No test was started.':undefined);$('start').hidden=false;}
  }catch(error){$('message').textContent='Test not started';$('detail').textContent=error.message;}finally{busy=false;}
 }
 for(const action of ['pause','resume','cancel'])$(action).addEventListener('click',async()=>{if(busy||!runId)return;busy=true;$(action).disabled=true;try{const data=await request({action,id:runId});if(data.run)render(data);else notice(data.status);}catch(error){$('detail').textContent=error.message;}finally{busy=false;$(action).disabled=false;}});
 let launched=false;
 function open(){if(launched||document.visibilityState==='hidden'||document.prerendering)return;launched=true;if(params.has('start')&&!runId)void start();else void refresh();timer=setInterval(()=>{if(runId||!params.has('start'))void refresh();},5000);}
 document.addEventListener('visibilitychange',open);document.addEventListener('prerenderingchange',open);window.addEventListener('pagehide',()=>clearInterval(timer));window.addEventListener('pageshow',event=>{if(event.persisted){timer=setInterval(()=>{if(runId||!params.has('start'))void refresh();},5000);void refresh();}});open();
})();
