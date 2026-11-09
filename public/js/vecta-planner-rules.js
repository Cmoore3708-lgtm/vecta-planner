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
    return other||list[1]||raw;
  }

var plannerRenderTimer=null,plannerRenderNeedsPacking=false;
function deferRender(options,render){
  if(!options||!options.fromCloud)plannerRenderNeedsPacking=true;
  if(plannerRenderTimer)return;
  plannerRenderTimer=root.setTimeout(function(){
    plannerRenderTimer=null;var needsPacking=plannerRenderNeedsPacking;plannerRenderNeedsPacking=false;
    render({fromCloud:!needsPacking});
  },180);
}
function updateContent(container,markup){
  /* Compare the original markup, not the DOM enriched with saved vehicle artwork.
     Echoes of our own saves and changes to other dates must not reload cards. */
  if(container.__vectaPlannerMarkup===markup&&container.__vectaPlannerRoot===container.firstChild)return false;
  var selector='.job[data-job-id],.mobileJob[data-open-job],.sideJob[data-open-job],.sideJob[data-open-unallocated],.quoteCard[data-open-job],.taskCard[data-task-drag]',previous=new Map();
  container.querySelectorAll(selector).forEach(function(card){
    var key=card.__vectaPlannerCardMarkup;if(!key)return;
    if(!previous.has(key))previous.set(key,[]);previous.get(key).push(card);
  });
  var template=container.ownerDocument.createElement('template');template.innerHTML=markup;
  template.content.querySelectorAll(selector).forEach(function(card){
    var key=card.outerHTML,matches=previous.get(key),old=matches&&matches.shift();
    if(old)card.replaceWith(old);else card.__vectaPlannerCardMarkup=key;
  });
  container.replaceChildren(template.content);container.__vectaPlannerMarkup=markup;container.__vectaPlannerRoot=container.firstChild;
  return true;
}

  function refreshArtwork(container,jobs,changed){
    if(!root.enrichHaynesDashboard)return;
    var byId=new Map((jobs||[]).map(function(job){return [String(job.id),job]})),tools=root.VectaHaynesJobTools;
    var signature=JSON.stringify(Array.from(container.querySelectorAll('[data-job-id],[data-open-job],[data-open-unallocated]')).map(function(card){
      var job=byId.get(card.dataset.jobId||card.dataset.openJob||card.dataset.openUnallocated);if(!job)return null;
      var drawing=tools&&tools.storedDrawing?tools.storedDrawing(job):null;
      return [job.id,job.registration,job.vehicle,job.make,job.model,drawing&&drawing.imageUrl,tools&&tools.dashboardColour?tools.dashboardColour(job):(job.vehicle_colour||job.colour||job.color||'')];
    }));
    if(!changed&&container.__vectaPlannerArtwork===signature)return;
    container.__vectaPlannerArtwork=signature;root.enrichHaynesDashboard(container,jobs);
  }
  // Hold the existing DOM from pointer-down through native dragstart or resize.
  if(root.document&&root.document.addEventListener){
    root.document.addEventListener('pointerdown',function(ev){root.__vectaPlannerPointerHeld=!!(ev.target&&ev.target.closest&&ev.target.closest('#content [draggable="true"],#content .resizeHandle,#content .resizeTopHandle'))},true);
    ['pointerup','pointercancel','dragend'].forEach(function(name){root.document.addEventListener(name,function(){root.__vectaPlannerPointerHeld=false},true)});
  }

  function hoursForTypes(types,templateForType){
    var hours=types.reduce(function(total,type){var value=Number(templateForType(type).estimated_hours);return total+(isFinite(value)&&value>0?value:0)},0);
    return hours>0?Math.round(hours*4)/4:1;
  }
  root.VectaPlannerRules=Object.freeze({
    hoursForTypes:hoursForTypes,
    deferRender:deferRender,
    updateContent:updateContent,
    refreshArtwork:refreshArtwork,
    isUnallocated:isUnallocated,
    technicianName:technicianName
  });
})(typeof window!=='undefined'?window:globalThis);
