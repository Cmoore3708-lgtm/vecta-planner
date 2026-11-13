(function(root){
 'use strict';
 const doc=root.document,pending=new Map();
 // The build pins these URLs to the current release. Offline-only links in the
 // shell let the worker store the files without executing optional tools.
 const paths={service:'/js/haynes-service-sheet.js',repair:'/js/vecta-repair-quote.js',tracker:'/js/vecta-monthly-tracker.js'};
 const ready={service:()=>typeof root.initHaynesServiceSheet==='function'&&root.initHaynesServiceSheet!==initService,repair:()=>typeof root.VectaRepairQuote?.mount==='function'&&root.VectaRepairQuote.mount!==mountRepair,tracker:()=>typeof root.VectaMonthlyTracker?.download==='function'&&root.VectaMonthlyTracker.download!==downloadTracker};
 function load(name){
  if(ready[name]())return Promise.resolve();
  if(pending.has(name))return pending.get(name);
  const task=new Promise((resolve,reject)=>{
   const script=doc.createElement('script');let finished=false;
   const finish=error=>{if(finished)return;finished=true;root.clearTimeout(timer);if(error){script.remove();reject(error);}else resolve();};
   const timer=root.setTimeout(()=>finish(Error('The tools took too long to load. Please retry.')),15000);
   script.src=paths[name];script.async=true;
   script.onload=()=>finish(ready[name]()?null:Error('The tools could not be started. Please retry.'));
   script.onerror=()=>finish(Error('The tools could not load. Check the connection and retry.'));
   doc.head.appendChild(script);
  });
  pending.set(name,task);
  task.catch(()=>{if(pending.get(name)===task)pending.delete(name);});
  return task;
 }
 function notice(host,message,retry,key){
  let panel=host.querySelector('[data-optional-tool="'+key+'"]');
  if(!panel){panel=doc.createElement('p');panel.dataset.optionalTool=key;panel.setAttribute('role','status');host.appendChild(panel);}
  panel.replaceChildren(doc.createTextNode(message+' '));
  if(retry){const button=doc.createElement('button');button.type='button';button.textContent='Retry';button.onclick=retry;panel.appendChild(button);}
  return panel;
 }
 async function initService(sheet,registration,kind){
  if(!sheet||kind!=='service')return;
  const panel=notice(sheet,'Loading service details…',null,'service');
  try{await load('service');panel.remove();if(sheet.isConnected)return await root.initHaynesServiceSheet(sheet,registration,kind);}
  catch(error){if(sheet.isConnected)notice(sheet,error.message,()=>initService(sheet,registration,kind),'service');}
 }
 const repairRuns=new WeakMap();
 function mountRepair(job,api){
  if(root.VECTA_MECHANIC_DEPLOYMENT===true)return;
  const modal=doc.getElementById('jobModal'),work=modal?.querySelector('.jobWorkSection');
  if(!work||['completed','work_complete','ready_to_invoice'].includes(doc.getElementById('job_status')?.value)||!doc.getElementById('privatePricingRows'))return;
  const run={};repairRuns.set(work,run);
  load('repair').then(()=>{
   if(repairRuns.get(work)!==run||!work.isConnected||!modal.classList.contains('open'))return;
   work.querySelector('[data-optional-tool="repair"]')?.remove();root.VectaRepairQuote.mount(job,api);
  }).catch(error=>{if(repairRuns.get(work)===run&&work.isConnected&&modal.classList.contains('open'))notice(work,error.message,()=>mountRepair(job,api),'repair');});
 }
 async function downloadTracker(...args){
  try{await load('tracker');return root.VectaMonthlyTracker.download(...args);}
  catch(error){root.alert('The monthly spreadsheet could not be downloaded. '+error.message);}
 }
 root.initHaynesServiceSheet=initService;
 root.prepareHaynesServicePrint=async function(scope){await load('service');return root.prepareHaynesServicePrint(scope);};
 root.openServiceResetProcedure=function(){load('service').then(()=>root.openServiceResetProcedure()).catch(error=>root.alert(error.message));};
 root.VectaRepairQuote={mount:mountRepair};
 root.VectaMonthlyTracker={download:downloadTracker};
})(window);
