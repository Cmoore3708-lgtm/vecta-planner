(function(root){
  'use strict';

  function statusKey(request){return String(request&&request.status||'awaiting_review').trim().toLowerCase()}
  function isInboxRequest(request){var status=statusKey(request);return status!=='booked'&&status!=='deleted'}
  function requestIdFromJob(job){
    var direct=String(job&&job.website_request_id||'').trim();
    if(direct)return direct;
    var match=String(job&&job.customer_note||'').match(/Website request ID:\s*([^|]+?)(?:\s*\|\||$)/i);
    return match?String(match[1]||'').trim():'';
  }
  function requestMatchesJob(request,job,dependencies){
    if(!request||!job)return false;
    var deps=dependencies||{},normalise=typeof deps.normaliseRegistration==='function'?deps.normaliseRegistration:function(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'')};
    var linked=requestIdFromJob(job);
    if(linked&&String(request.id)===linked)return true;
    if(request.job_id&&String(request.job_id)===String(job.id))return true;
    if(typeof deps.isWebsiteJob==='function'&&!deps.isWebsiteJob(job))return false;
    var requestReg=normalise(request.registration||''),jobReg=normalise(job.registration||'');
    var requestName=String(request.customer_name||'').trim().toLowerCase(),jobName=String(job.customer_name||'').trim().toLowerCase();
    var requestWork=String(request.work_required||'').trim(),jobWork=String(job.work_required||'').trim();
    var sameReg=!!requestReg&&requestReg===jobReg,sameName=!!requestName&&requestName===jobName,sameWork=!!requestWork&&requestWork===jobWork;
    return (sameReg&&sameName)||(sameReg&&sameWork)||(sameName&&sameWork);
  }

  root.VectaBookingRules=Object.freeze({
    statusKey:statusKey,
    isInboxRequest:isInboxRequest,
    requestIdFromJob:requestIdFromJob,
    requestMatchesJob:requestMatchesJob
  });
})(typeof window!=='undefined'?window:globalThis);
