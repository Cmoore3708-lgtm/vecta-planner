(function(root){
  'use strict';

  var SOFT_DELETE_PATTERN=/\[\[VECTA_SOFT_DELETE:([^\]]+)\]\]/i;

  function softDeleteMeta(job){
    var note=String(job&&job.customer_note||''),match=note.match(SOFT_DELETE_PATTERN);
    if(!match)return null;
    try{return JSON.parse(decodeURIComponent(match[1]))}
    catch(_error){return {deleted_at:'',legacy:true}}
  }

  function isSoftDeleted(job){return !!softDeleteMeta(job)}

  function isDeleted(job,dependencies){
    if(!job)return true;
    if(String(job.status||'').trim().toLowerCase()==='deleted')return true;
    if(isSoftDeleted(job))return true;
    var id=String(job.id||''),deps=dependencies||{};
    try{var terminal=id&&typeof deps.terminalState==='function'?deps.terminalState(id):null;if(terminal&&terminal.state==='deleted')return true}catch(_error){}
    try{if(id&&typeof deps.isTombstone==='function'&&deps.isTombstone(id))return true}catch(_error){}
    return false;
  }

  function bindRegistration(field,actions){
    var timer;
    field.oninput=function(){
      var typed=actions.clean(field.value);
      field.value=actions.stored(typed)||typed;
      clearTimeout(timer);
      timer=setTimeout(function(){actions.applyStored(field);actions.refresh()},220);
      actions.lookup(field.value,650);
    };
    field.onchange=field.onblur=function(){
      actions.applyStored(field);
      actions.refresh();
      actions.commit();
      actions.lookup(field.value,80);
    };
  }

  root.VectaJobRules=Object.freeze({
    bindRegistration:bindRegistration,
    softDeleteMeta:softDeleteMeta,
    isSoftDeleted:isSoftDeleted,
    isDeleted:isDeleted
  });
})(typeof window!=='undefined'?window:globalThis);
