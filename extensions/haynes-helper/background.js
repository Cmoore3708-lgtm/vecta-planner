import './rules.js';
let busy=false;
const SOURCE='https://www.workshopdata.com/touch/site/layout/makesOverview';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function read(tabId,command,payload={}){
  const result=await chrome.scripting.executeScript({target:{tabId},files:['rules.js','haynes-page.js']});
  if(!result.length)throw Error('HaynesPro did not load.');
  const replies=await chrome.tabs.sendMessage(tabId,{command,payload});
  if(replies.error)throw Error(replies.error);return replies;
}
async function waitFor(tabId,predicate){
  const end=Date.now()+25000;
  while(Date.now()<end){
    try{const value=await read(tabId,'snapshot');if(value.login||value.blocked)throw Object.assign(Error(value.login?'Sign in to HaynesPro in the opened tab, then retry.':'HaynesPro requires manual verification.'),{stop:true});if(predicate(value))return value;}
    catch(e){if(e.stop)throw e;}
    await pause(350);
  }throw Error('HaynesPro did not return the expected page. No data was imported.');
}
async function run(action,payload){
  const request={registration:VectaHaynesRules.reg(payload?.registration),mileage:Number(payload?.mileage),conditions:payload?.conditions,period:payload?.period};
  if(!/^[A-Z0-9]{2,10}$/.test(request.registration)||!Number.isInteger(request.mileage)||request.mileage<=0)throw Error('Registration and current mileage are required.');
  if(!['normal','severe'].includes(request.conditions))throw Error('Confirm vehicle usage conditions.');
  if(action==='extract'){VectaHaynesRules.safeUrl(payload.periodUrl);if(!VectaHaynesRules.interval(request.period))throw Error('Choose a service interval.');}
  const tab=await chrome.tabs.create({url:SOURCE,active:false});let keep=false;
  try{
    await waitFor(tab.id,s=>s.registrationInput);
    await read(tab.id,'registration',request);
    const model=await waitFor(tab.id,s=>s.model&&s.registration===request.registration);
    if(action==='discover'){
      await read(tab.id,'maintenance');
      const systems=await waitFor(tab.id,s=>s.systems.length>0);
      const eligible=systems.systems.filter(s=>new RegExp(request.conditions==='normal'?'Normal conditions':'Severe conditions','i').test(s.label));
      if(eligible.length!==1)throw Error('More than one maintenance system applies. Select the correct variant in HaynesPro before importing.');
      await read(tab.id,'system',{id:eligible[0].id});
      const schedule=await waitFor(tab.id,s=>s.periods.length>0);
      return {data:{...model,periods:schedule.periods,system:eligible[0].label}};
    }
    const periodUrl=new URL(payload.periodUrl);if(periodUrl.searchParams.get('typeId')!==model.typeId||!periodUrl.pathname.endsWith('/maintenanceSchedule'))throw Error('The interval belongs to another vehicle. Run the lookup again.');
    await chrome.tabs.update(tab.id,{url:periodUrl.href});
    const checklist=await waitFor(tab.id,s=>s.operations.length>=3&&s.period===request.period);
    if(!checklist.lubricantUrl)throw Error('No engine oil link was found.');
    VectaHaynesRules.safeUrl(checklist.lubricantUrl);
    await chrome.tabs.update(tab.id,{url:checklist.lubricantUrl});
    await waitFor(tab.id,s=>s.engineLinks.length>0);
    await read(tab.id,'lubricants');
    const oilPage=await waitFor(tab.id,s=>s.engineSections.length>0);
    const engine=VectaHaynesRules.ukEngine(oilPage.engineSections);
    const raw={...checklist,registration:model.registration,vehicle:model.vehicle,oil:engine.lines};
    return {data:VectaHaynesRules.normalise(raw,request)};
  }catch(e){keep=true;await chrome.tabs.update(tab.id,{active:true}).catch(()=>{});throw e;}
  finally{if(!keep)await chrome.tabs.remove(tab.id).catch(()=>{});}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    const {vectaOrigins=[]}=await chrome.storage.local.get('vectaOrigins');
    if(!sender.tab||sender.frameId!==0||!vectaOrigins.includes(new URL(sender.url).origin))throw Error('This Vecta page is not connected.');
    if(message.action==='ping')return {ready:true};
    if(!['discover','extract'].includes(message.action))throw Error('Unknown action.');
    if(busy)throw Error('Another service lookup is running. Please wait.');
    busy=true;try{return await run(message.action,message.payload);}finally{busy=false;}
  })().then(respond).catch(e=>respond({error:e.message}));return true;
});
