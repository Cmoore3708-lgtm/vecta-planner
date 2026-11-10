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
 const draft=JSON.parse(storage.getItem(key)||'null');
 if(!draft||!draft.html||Object.keys(identity).some(k=>draft[k]!==identity[k]))return false;
 if(saved&&time(saved)>time(draft))return false;
 container.innerHTML=draft.html;return true;
}
root.VectaServiceSheetRecovery={snapshot,persist,restore};
})(typeof window!=='undefined'?window:globalThis);
