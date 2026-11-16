/* Each calendar editor gets its own document, form IDs and editor baseline. */
(function(root){
 'use strict';
 const doc=root.document,childId=new URLSearchParams(root.location.search).get('calendarJobPopup');
 const isChild=!!childId&&root.parent!==root;
 let active=null,childDirty=false,childOpened=false,closeAfterSave=false;
  function calendarPlannerHtml(date,inlineMode,context){
    const {mechanics,totalPct,dayPct,calendarDayJobs,plannerTechnicianLane,byTime,esc,niceDate,jobTitle}=context;
    var mechs=mechanics(),start=8,end=17,px=44,height=(end-start)*px;
    function top(time){var parts=String(time||'08:00').split(':'),mins=(Number(parts[0]||8)*60+Number(parts[1]||0))-(start*60);return Math.max(0,mins/60*px)}
    function h(job){return Math.max(28,Number(job.estimated_hours||1)*px-4)}
    var times='';for(var hr=start;hr<=end;hr++)times+='<div class="v243MiniTime" style="top:'+((hr-start)*px)+'px">'+String(hr).padStart(2,'0')+':00</div>';
    return '<div class="v243PlannerTitle"><div><h3>'+esc(niceDate(date))+'</h3><p>Click a job to open it.</p></div>'+(inlineMode?'':'<button type="button" class="primary" data-v243-use-date>View this date</button>')+'</div>'+
      '<div class="v245CalendarStats"><div><small>ALFIE</small><strong>'+dayPct(date,'Alfie')+'%</strong></div><div><small>'+esc(mechs[1]||'Chris')+'</small><strong>'+dayPct(date,'Other')+'%</strong></div><div><small>TOTAL</small><strong>'+totalPct(date)+'%</strong></div></div>'+
      '<div class="v243PlannerGrid" style="--v243-mini-height:'+height+'px"><div class="v243PlannerHead">Time</div>'+mechs.map(function(mech){return '<div class="v243PlannerHead">'+esc(mech)+' <small>'+dayPct(date,mech)+'%</small></div>'}).join('')+
      '<div class="v243TimeLane" style="height:'+height+'px">'+times+'</div>'+
      mechs.map(function(mech){
        var jobs=calendarDayJobs(date).filter(function(j){return plannerTechnicianLane(j.technician)===plannerTechnicianLane(mech)}).sort(byTime);
        return '<div class="v243PlannerLane" style="height:'+height+'px">'+jobs.map(function(j){
          return '<button type="button" class="v243PlannerJob" data-v243-open-job="'+esc(j.id||'')+'" style="text-align:left;top:'+top(j.drop_time)+'px;height:'+h(j)+'px"><b>'+esc(j.registration||'NO REG')+'</b><span>'+esc(j.work_required||jobTitle(j))+'</span><small>'+esc(j.drop_time||'08:00')+'</small></button>';
        }).join('')+'</div>';
      }).join('')+'</div>';
  }
 function mergeQueuedJobs(jobs,queued,newer,normalise,decode){
  Object.keys(queued).forEach(id=>{
   const item=queued[id],row=item&&item.payload;
   if(!row||Array.isArray(row)||item.operation!=='upsert'||!row.id)return;
   const index=jobs.findIndex(job=>String(job.id)===String(row.id)),current=jobs[index];
   if(current&&newer(item,current))jobs[index]=normalise(Object.assign({},current,decode(row)));
  });
 }
 function refreshCalendar(options){
  const state=root.vectaCalendarPopupState();
  mergeQueuedJobs(state.jobs,state.queued,state.newer,state.normalise,state.decode);
  return root.vectaRefreshPortalJobs().catch(()=>false).finally(()=>{
   if(!options.preview.isConnected)return;
   const restoreFocus=doc.activeElement===options.card||doc.activeElement===doc.body;
   options.render();
   if(restoreFocus){const returned=Array.from(options.preview.querySelectorAll('[data-v243-open-job]')).find(button=>button.dataset.v243OpenJob===options.card.dataset.v243OpenJob);returned?.focus({preventScroll:true});}
  });
 }
 function formState(){return JSON.stringify(Array.from(doc.querySelectorAll('#jobModal input,#jobModal select,#jobModal textarea')).map(el=>[el.id,el.value,el.checked]));}
 function parentApi(){try{return root.parent.VectaCalendarJobPopup}catch{return null}}
 function finish(){parentApi()?.finishChild(root);}
 function requestClose(){
  if(active&&active.frame.contentWindow.VectaCalendarJobPopup?.requestClose()===false)return false;
  if(Number(root.__vectaJobSaveFenceUntil||0)>Date.now())return false;
  if(childOpened&&doc.querySelector('#jobModal.open')&&childDirty&&!root.confirm('Close this pop-up without saving its changes?'))return false;
  return true;
 }
 function closeActive(check){
  if(!active)return;
  const current=active;
  try{if(check&&current.frame.contentWindow.VectaCalendarJobPopup?.requestClose()===false)return}catch{}
  active=null;current.dialog.close();current.dialog.remove();
  setTimeout(()=>{if(current.focus?.isConnected)current.focus.focus({preventScroll:true});},0);
  if(current.onClose)Promise.resolve().then(()=>typeof current.onClose==='function'?current.onClose():refreshCalendar(current.onClose)).catch(()=>{});
 }
 function open(id,registration,onClose){
  if(active){active.dialog.focus();return;}
  const returnFocus=doc.activeElement;
  const dialog=doc.createElement('dialog');dialog.className='calendarJobPopup';
  dialog.setAttribute('aria-label','Job card '+(registration||''));
  const head=doc.createElement('header'),title=doc.createElement('strong'),close=doc.createElement('button');
  title.textContent='Job card'+(registration?' · '+registration:'');
  close.type='button';close.className='btn';close.textContent='Close pop-up';close.autofocus=true;
  const frame=doc.createElement('iframe');frame.title='Job card '+(registration||'');
  const url=new URL(root.location.href);url.hash='';url.searchParams.set('calendarJobPopup',String(id));
  frame.src=url.href;head.append(title,close);dialog.append(head,frame);doc.body.appendChild(dialog);
  active={dialog,frame,onClose,focus:returnFocus};
  close.onclick=()=>closeActive(true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeActive(true);});
  dialog.showModal();
 }
 root.VectaCalendarJobPopup={open,requestClose,mergeQueuedJobs,plannerHtml:calendarPlannerHtml,
  openEditor(id,jobs,isDeleted,openJob){
   if(doc.body.classList.contains('vectaStartupLoading'))return 'loading';
   const job=jobs.find(row=>String(row.id)===String(id)&&!isDeleted(row));
   if(!job)return 'missing';
   openJob(job.id);return 'open';
  },
  finishChild(source){if(active&&active.frame.contentWindow===source)closeActive(false);},
  saved(){if(isChild&&closeAfterSave)setTimeout(finish,0);}
 };
 if(!isChild)return;
 doc.documentElement.classList.add('calendarJobPopupChild');
 function start(){
  const status=doc.createElement('section');status.className='calendarJobPopupStatus';status.setAttribute('role','status');
  const label=doc.createElement('p'),retry=doc.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Retry';retry.hidden=true;
  label.textContent='Opening job card…';status.append(label,retry);doc.body.appendChild(status);
  let opening=false;
  function attempt(){
   if(opening||childOpened||typeof root.vectaCalendarPopupState!=='function')return;
   opening=true;
   try{
    const state=root.vectaCalendarPopupState(),result=root.VectaCalendarJobPopup.openEditor(childId,state.jobs,state.isDeleted,root.openJobModal);
    if(result==='open'){
     childOpened=true;status.remove();observer.disconnect();clearTimeout(timeout);
     // Track form events and button-driven field edits without touching the parent draft.
     doc.addEventListener('input',event=>{if(event.target.closest('#jobModal'))childDirty=true;});
     doc.addEventListener('change',event=>{if(event.target.closest('#jobModal'))childDirty=true;});
     doc.addEventListener('click',event=>{
      if(!event.target.closest('#jobModal button'))return;
      const before=formState();Promise.resolve().then(()=>{if(formState()!==before)childDirty=true;});
     },true);
    }else if(result==='missing'){label.textContent='This job is no longer available. Close the pop-up to return to your original job.';retry.hidden=false;}
   }catch{label.textContent='The job card could not open. Your original job is still open behind this pop-up.';retry.hidden=false;}
   finally{opening=false;}
  }
  const observer=new MutationObserver(attempt);observer.observe(doc.body,{attributes:true,attributeFilter:['class']});
  const timeout=setTimeout(()=>{if(!childOpened){label.textContent='The job is taking longer to load. Retry, or close the pop-up to return to your original job.';retry.hidden=false;}},30000);
  retry.onclick=()=>{label.textContent='Opening job card…';retry.hidden=true;attempt();};
  doc.addEventListener('click',event=>{
   if(event.target.closest('#jobModal button'))closeAfterSave=!!event.target.closest('#saveJob,#saveJobMobile');
   if(event.target.closest('#jobModal [data-close-modal],#jobModal #cancelJob')){
    event.preventDefault();event.stopImmediatePropagation();if(requestClose())finish();
   }
  },true);
  doc.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!active&&doc.querySelectorAll('.modal.open').length===1&&doc.querySelector('#jobModal.open')){
    event.preventDefault();event.stopImmediatePropagation();if(requestClose())finish();
   }
  },true);
  attempt();
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',()=>setTimeout(start,0),{once:true});else setTimeout(start,0);
})(window);
