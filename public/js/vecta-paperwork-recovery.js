(function(root){
'use strict';
// Drafts are separate from completed service records and are scoped to one visit.
function snapshot(sheet,logoSrc){
 const copy=sheet.cloneNode(true),inputs=sheet.querySelectorAll('input,textarea,select');
 Array.from(copy.querySelectorAll('input,textarea,select')).forEach((node,index)=>{
  const live=inputs[index];
  if(node.tagName==='TEXTAREA')node.textContent=live.value;
  else if(node.tagName==='SELECT')Array.from(node.options).forEach((option,i)=>{if(live.options[i].selected)option.setAttribute('selected','');else option.removeAttribute('selected');});
  else{node.setAttribute('value',live.value);if(live.checked)node.setAttribute('checked','');else node.removeAttribute('checked');}
 });
 copy.removeAttribute('data-saving');copy.removeAttribute('inert');
 for(const node of copy.querySelectorAll('[data-optional-tool]'))node.remove();
 for(const img of copy.querySelectorAll('.ssBrand img'))img.setAttribute('src',logoSrc);
 return copy.outerHTML;
}
// Full sheets contain large embedded vehicle artwork. Use IndexedDB for drafts;
// localStorage is only a fallback/legacy source, never the only recovery copy.
const time=record=>Date.parse(record&&(record.updated_at||record.saved_at||record.created_at)||0)||0;
function createDraftStore({storage,indexedDB=root.indexedDB,readRow,writeRow,removeRow}={}){
 let database=null,queue=Promise.resolve();const confirmed=new Map();
 function open(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);error?reject(error):resolve(db);};
   const timer=setTimeout(()=>finish(Error('Draft storage took too long to open.')),2500);
   try{
    const request=indexedDB.open('vecta-service-drafts-v1',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts',{keyPath:'key'});};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};finish(null,request.result);};
    request.onerror=()=>finish(request.error||Error('Draft storage is unavailable.'));
    request.onblocked=()=>finish(Error('Draft storage is blocked.'));
   }catch(error){finish(error);}
  }).catch(error=>{database=null;throw error;});return database;
 }
 async function transaction(mode,action){
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts',mode);let value;
   const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(Error('Draft storage did not finish.'));},8000);
   tx.oncomplete=()=>{clearTimeout(timer);resolve(value);};
   tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error||Error('Draft storage failed.'));};
   try{const request=action(tx.objectStore('drafts'));request.onsuccess=()=>{value=request.result;};}catch(error){clearTimeout(timer);try{tx.abort();}catch{}reject(error);}
  });
 }
 const read=readRow||(key=>transaction('readonly',store=>store.get(key)));
 const write=writeRow||(row=>transaction('readwrite',store=>store.put(row)));
 const remove=removeRow||(key=>transaction('readwrite',store=>store.delete(key)));
 const legacy=key=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
 function serial(work){const task=queue.catch(()=>{}).then(work);queue=task;return task;}
 return {
  put(key,draft){return serial(async()=>{
   if(confirmed.get(key)?.html===draft.html)return true;
   try{await write({...draft,key});try{storage.removeItem(key);}catch{}}
   catch(error){storage.setItem(key,JSON.stringify(draft));}
   confirmed.set(key,draft);return true;
  });},
  async get(key){
   await queue.catch(()=>{});let saved=null;
   try{saved=await read(key);}catch{}
   const old=legacy(key);return old&&(!saved||time(old)>time(saved))?old:saved;
  },
  remove(key){return serial(async()=>{confirmed.delete(key);try{await remove(key);}finally{try{storage.removeItem(key);}catch{}}});}
 };
}
const stores=new WeakMap();
function draftStore(storage){if(!stores.has(storage))stores.set(storage,createDraftStore({storage}));return stores.get(storage);}
async function persist(storage,key,identity,sheet,logoSrc){
 const html=snapshot(sheet,logoSrc);
 return draftStore(storage).put(key,{...identity,updated_at:new Date().toISOString(),html});
}
async function restore(storage,key,identity,container,saved){
 const original=container.firstElementChild;
 try{
  const draft=await draftStore(storage).get(key);
  if(container.firstElementChild!==original||!draft||!draft.html||Object.keys(identity).some(k=>draft[k]!==identity[k]))return false;
  if(saved&&time(saved)>time(draft))return false;
  container.innerHTML=draft.html;return true;
 }catch(error){console.warn('Paperwork draft could not be opened',error);return false;}
}
async function clearDraft(storage,key){try{await draftStore(storage).remove(key);}catch(error){console.warn('Saved draft cleanup will retry later',error);}}
async function saveRemote(remoteClient,record,normReg,serviceRecordKind,serviceRemoteKey){
  if(!remoteClient)throw new Error('Supabase is not connected.');
  var reg=normReg(record.registration||''),kind=serviceRecordKind(record),jobId=String(record.job_id||''),id=serviceRemoteKey(reg,kind,jobId),canonicalId=serviceRemoteKey(reg,kind,''),updatedAt=record.updated_at||new Date().toISOString(),baseValue=Object.assign({},record,{registration:reg,sheet_type:kind,job_id:jobId,updated_at:updatedAt}),payloads=[{id:id,value:Object.assign({},baseValue,{id:id}),updated_at:updatedAt}];
  if(canonicalId!==id)payloads.push({id:canonicalId,value:Object.assign({},baseValue,{id:canonicalId}),updated_at:updatedAt});
  var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},20000),saved;
  try{saved=await remoteClient.from('workshop_settings').upsert(payloads,{onConflict:'id'}).select('id,value,updated_at').abortSignal(controller.signal)}finally{clearTimeout(timer)}
  if(saved.error)throw new Error(controller.signal.aborted?'The cloud save timed out. Check the connection and retry.':saved.error.message||'Shared paperwork save failed.');
  var rows=Array.isArray(saved.data)?saved.data:(saved.data?[saved.data]:[]),row=rows.find(function(item){return item&&item.id===id});
  if(!row||!row.value||row.value.html!==record.html)throw new Error('The cloud did not confirm this paperwork. Keep the sheet open and retry.');
  var confirmed=Object.assign({},row.value,{id:id,registration:reg,sheet_type:kind,job_id:jobId,updated_at:row.updated_at||updatedAt});
  // The canonical workshop_settings write is required. The legacy mirror must
  // never hold the Save button open after the canonical write has succeeded.
  try{Promise.resolve(remoteClient.from('service_records').upsert(confirmed,{onConflict:'id'})).then(function(optional){if(optional.error)console.warn('Optional service_records mirror unavailable',optional.error)}).catch(function(error){console.warn('Optional service_records mirror unavailable',error)})}catch(error){console.warn('Optional service_records mirror unavailable',error)}
  return confirmed;
}
async function persistCurrent(document,storage,key,identity,logoSrc,status){
 const sheet=document.querySelector('#printSheet .servicePrint');if(!sheet||!identity.registration)return true;
 try{return await persist(storage,key,identity,sheet,logoSrc);}
 catch(error){console.warn('Paperwork draft could not be kept',error);status('Draft could not be kept on this device. Keep this sheet open and use Save.');return false;}
}
function watch(sheet,persistDraft,status){
 if(!sheet)return;
 for(const name of ['input','change','click'])sheet.addEventListener(name,async()=>{if(sheet.getAttribute('data-saving')==='true')return;const kept=await persistDraft();if(kept&&sheet.isConnected&&sheet.getAttribute('data-saving')!=='true')status('Draft kept on this device. Press Save to share it.');});
}
function setSaving(sheet,document,saving){
 if(saving){sheet.setAttribute('data-saving','true');sheet.setAttribute('inert','');}
 else{sheet.removeAttribute('data-saving');sheet.removeAttribute('inert');}
 for(const button of document.querySelectorAll('#servicePreviewControls button'))button.disabled=saving;
 const button=document.querySelector('#servicePreviewControls .savePreview');if(button)button.textContent=saving?'Saving…':'Save';
}
async function finishSave(sheet,document,completed,persistDraft,status){
 setSaving(sheet,document,false);
 if(!completed)status(await persistDraft()?'Save did not finish. Draft kept on this device — press Save to retry.':'Save did not finish. Keep this sheet open and retry.');
}
root.VectaServiceSheetRecovery={createDraftStore,clearDraft,snapshot,persistCurrent,restore,watch,saveRemote,setSaving,finishSave};
})(typeof window!=='undefined'?window:globalThis);
