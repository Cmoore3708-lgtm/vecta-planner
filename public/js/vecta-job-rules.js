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

  function nmukJobCostCentre(job){
    var match=String(job&&job.customer_note||'').match(/\[\[VECTA_COST_CENTRE:([^\]]*)\]\]/);
    if(!match)return null;
    try{return decodeURIComponent(match[1])}catch(e){return ''}
  }
  function noteWithNmukCostCentre(note,value){
    var clean=String(note||'').replace(/\n?\[\[VECTA_COST_CENTRE:[^\]]*\]\]/g,'');
    if(value==null)return clean;
    value=String(value).trim();
    return clean+'\n[[VECTA_COST_CENTRE:'+encodeURIComponent(value)+']]';
  }
  function bindNmukCostCentre(job){
    var input=document.getElementById('job_cost_centre'),reg=document.getElementById('job_registration');
    if(!input||!reg)return;
    var savedKey=normReg(job.registration),previousKey=null;
    function refresh(){
      var key=normReg(reg.value);
      if(key===previousKey)return;
      previousKey=key;
      var fleet=fleetVehicleForRegistration(key);
      var saved=key===savedKey?nmukJobCostCentre(job):null;
      input.value=saved==null?(fleet&&fleet.costCentre)||'':saved;
    }
    reg.addEventListener('input',refresh);
    reg.addEventListener('change',refresh);
    refresh();
  }
  function fleetNmukCsvVehicleRows(rows){
    var groups=new Map();
    (rows||[]).forEach(function(r,index){
      var registration=fleetEomRegistrationText(r.job),key=normReg(r.job&&r.job.registration||'');
      if(!key||key==='NOVEHICLE')key='unregistered:'+index;
      var costCentre=nmukJobCostCentre(r.job)||'';
      key=JSON.stringify([key,costCentre]);
      var group=groups.get(key);
      if(!group){group={registration:registration,costCentre:costCentre,dates:[],types:[],descriptions:[],amount:0};groups.set(key,group)}
      var date=fleetNmukCsvDate(r.date),type=fleetNmukCsvTypeForJob(r.job);
      if(group.dates.indexOf(date)<0)group.dates.push(date);
      if(group.types.indexOf(type)<0)group.types.push(type);
      fleetEomLineItems(r.job).forEach(function(item){var description=String(item.description||'').replace(/\s+/g,' ').trim();if(description)group.descriptions.push(description)});
      group.amount+=Number(r.amount||0);
    });
    return Array.from(groups.values()).map(function(group){return [group.dates.join('; '),group.registration,group.types.join('; '),group.descriptions.join('; '),group.amount.toFixed(2),group.costCentre]});
  }

  root.VectaJobRules=Object.freeze({
    nmukJobCostCentre:nmukJobCostCentre,
    noteWithNmukCostCentre:noteWithNmukCostCentre,
    bindNmukCostCentre:bindNmukCostCentre,
    fleetNmukCsvVehicleRows:fleetNmukCsvVehicleRows,
    bindRegistration:bindRegistration,
    softDeleteMeta:softDeleteMeta,
    isSoftDeleted:isSoftDeleted,
    isDeleted:isDeleted
  });
})(typeof window!=='undefined'?window:globalThis);
