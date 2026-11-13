(function(root){
'use strict';
async function restoreSoftDeletedJob(id){
  if(!remoteClient||!navigator.onLine){alert('Connect to the workshop server before restoring a job.');return false;}
  var busy=window.__vectaRestoringJobs||(window.__vectaRestoringJobs={});if(busy[String(id)])return false;
  busy[String(id)]=true;window.__vectaJobSaveFenceUntil=Date.now()+30000;
  try{
    var probe=await remoteClient.from('jobs').select('*').eq('id',id).limit(1);
    if(probe.error)throw probe.error;
    var previous=probe.data&&probe.data[0],meta=vectaSoftDeleteMeta(previous);
    if(!previous||!meta||meta.legacy||!Date.parse(meta.deleted_at))throw new Error('This job is no longer in the recoverable Deleted Jobs area. Refresh and try again.');
    if(!confirm('Restore '+jobVehicleLabel(previous)+'?\n\nThis will return the existing database record to Workshop Pro. No duplicate job will be created.'))return false;
    var now=new Date().toISOString(),note=vectaStripSoftDeleteMeta(previous.customer_note).replace(/\s*\[\[VECTA_RESTORE_JOB:[^\]]+\]\]/g,'');
    var patch={archived:meta.archived===true,booking_date:meta.booking_date===undefined?previous.booking_date:meta.booking_date,technician:meta.technician===undefined?previous.technician:meta.technician,ramp:meta.ramp===undefined?previous.ramp:meta.ramp,status:meta.status||previous.status||'booked',customer_note:note+'\n[[VECTA_RESTORE_JOB:'+now+']]',updated_at:now};
    // Update only the version just read. Preserve price, invoices, completion
    // evidence and allocation; never queue an unverified offline restoration.
    var query=remoteClient.from('jobs').update(patch).eq('id',id);
    query=previous.updated_at?query.eq('updated_at',previous.updated_at):query.is('updated_at',null);
    var saved=await query.select('*');if(saved.error)throw saved.error;
    if(!saved.data||saved.data.length!==1)throw new Error('The job changed on another device. Refresh and try again.');
    var job=fromRemote(saved.data[0]);
    if(isSoftDeletedJob(job)||String(job.customer_note||'').indexOf('[[VECTA_RESTORE_JOB:'+now+']]')<0)throw new Error('Restore could not be verified on the workshop server.');
    var terminal={state:'reopened',restored_at:now,restore_of_deleted_at:meta.deleted_at,updated_at:now};
    vectaSetTerminalJobStateLocal(id,terminal);
    var ledgerSaved=await vectaWriteTerminalJobState(job,'reopened',terminal);
    vectaApplyRestoredJobState(job);
    var pending=vectaPendingSync(),superseded=pending.filter(function(item){item=vectaNormaliseQueuedItem(item);return item.table==='jobs'&&String(item.payload&&item.payload.id||'')===String(id)});
    if(superseded.length){vectaArchiveSyncItems(superseded,'Explicit restore superseded cached job changes');vectaSavePendingSync(pending.filter(function(item){return superseded.indexOf(item)<0}));}
    var index=(app.jobs||[]).findIndex(function(x){return String(x.id)===String(id)});if(index>=0)app.jobs[index]=job;else app.jobs.push(job);
    invalidateFinanceDashboardCache();saveLocal();render();
    if(!ledgerSaved)console.warn('Restore saved on job; durable restore marker supersedes the older deletion ledger.');
    return true;
  }catch(e){alert('Restore was not confirmed. Refresh Deleted Jobs and try again.\n\n'+(e.message||e));return false;}
  finally{delete busy[String(id)];window.__vectaJobSaveFenceUntil=0;}
}
root.VectaJobRecovery={restore:restoreSoftDeletedJob};
})(window);
