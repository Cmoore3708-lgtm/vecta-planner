(function(root){
  'use strict';

  function isUnallocated(job){
    var technician=String(job&&job.technician||'').trim();
    return !technician||technician.toLowerCase()==='unallocated';
  }

  function technicianName(job,mechanics){
    var raw=String(job&&job.technician||'').trim();
    var list=Array.isArray(mechanics)?mechanics:[];
    if(!raw||raw.toLowerCase()==='unallocated')return raw;
    var exact=list.find(function(name){return String(name||'').trim().toLowerCase()===raw.toLowerCase()});
    if(exact)return exact;
    var other=list.find(function(name){return String(name||'').trim().toLowerCase()==='other'});
    return other||raw;
  }

  root.VectaPlannerRules=Object.freeze({
    isUnallocated:isUnallocated,
    technicianName:technicianName
  });
})(typeof window!=='undefined'?window:globalThis);
