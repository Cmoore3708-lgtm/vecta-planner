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
function persist(storage,key,identity,sheet,logoSrc){
 const html=snapshot(sheet,logoSrc),previous=JSON.parse(storage.getItem(key)||'null');
 if(!previous||previous.html!==html)storage.setItem(key,JSON.stringify({...identity,updated_at:new Date().toISOString(),html}));
 return true;
}
const time=record=>Date.parse(record&&(record.updated_at||record.saved_at||record.created_at)||0)||0;
function restore(storage,key,identity,container,saved){
 try{
 const draft=JSON.parse(storage.getItem(key)||'null');
 if(!draft||!draft.html||Object.keys(identity).some(k=>draft[k]!==identity[k]))return false;
 if(saved&&time(saved)>time(draft))return false;
 container.innerHTML=draft.html;return true;
 }catch(error){console.warn('Paperwork draft could not be opened',error);return false;}
}
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
function persistCurrent(document,storage,key,identity,logoSrc,status){
 const sheet=document.querySelector('#printSheet .servicePrint');if(!sheet||!identity.registration)return true;
 try{return persist(storage,key,identity,sheet,logoSrc);}
 catch(error){console.warn('Paperwork draft could not be kept',error);status('Draft could not be kept on this device. Keep this sheet open and use Save.');return false;}
}
function watch(sheet,persistDraft,status){
 if(!sheet)return;
 for(const name of ['input','change','click'])sheet.addEventListener(name,()=>{if(sheet.getAttribute('data-saving')!=='true'&&persistDraft())status('Draft kept on this device. Press Save to share it.');});
}
function setSaving(sheet,document,saving){
 if(saving){sheet.setAttribute('data-saving','true');sheet.setAttribute('inert','');}
 else{sheet.removeAttribute('data-saving');sheet.removeAttribute('inert');}
 for(const button of document.querySelectorAll('#servicePreviewControls button'))button.disabled=saving;
 const button=document.querySelector('#servicePreviewControls .savePreview');if(button)button.textContent=saving?'Saving…':'Save';
}
function finishSave(sheet,document,completed,persistDraft,status){
 setSaving(sheet,document,false);
 if(!completed)status(persistDraft()?'Save did not finish. Draft kept on this device — press Save to retry.':'Save did not finish. Keep this sheet open and retry.');
}
root.VectaServiceSheetRecovery={snapshot,persistCurrent,restore,watch,saveRemote,setSaving,finishSave};
})(typeof window!=='undefined'?window:globalThis);
