/* V280 - staged mechanic work-complete workflow (refresh-safe build).
   Shared by Workshop Pro and the dedicated Mechanic Dashboard deployment.
   Uses the existing jobs.status column (work_complete), so no database migration is required. */
(function(){
  'use strict';
  try {
    var IS_MECHANIC = window.VECTA_MECHANIC_DEPLOYMENT === true;
    var WORK_COMPLETE = 'work_complete';

    function liveJob(id){
      if(typeof app==='undefined'||!app||!Array.isArray(app.jobs)) return null;
      return app.jobs.find(function(j){return String(j&&j.id||'')===String(id||'');})||null;
    }
    function isWorkComplete(j){return !!j && String(j.status||'').toLowerCase()===WORK_COMPLETE;}

    /* Styling is injected here rather than modifying the large legacy stylesheet. */
    try {
      var style=document.createElement('style');
      style.id='v280-mechanic-work-complete-style';
      style.textContent=[
        '.job.mechanicWorkComplete{outline:4px solid #16a34a!important;outline-offset:-3px!important;box-shadow:0 0 0 1px #14532d,0 4px 12px rgba(22,163,74,.22)!important;}',
        '.job.mechanicWorkComplete .plannerJobHeader:after{content:"WORK COMPLETE";display:inline-flex;align-items:center;margin-left:7px;padding:2px 6px;border-radius:999px;background:#16a34a;color:#fff;font-size:8px;font-weight:1000;letter-spacing:.04em;white-space:nowrap;}',
        '.v280ReturnMechanic{background:#166534!important;color:#fff!important;border-color:#166534!important;}',
        '.v280MechanicComplete{background:#16a34a!important;color:#fff!important;border-color:#15803d!important;font-weight:900!important;}'
      ].join('');
      (document.head||document.documentElement).appendChild(style);
    } catch(e){ console.warn('V280 style injection skipped',e); }

    /* Workshop Pro: retain the job on Chris's planner and give it a green outline. */
    if(!IS_MECHANIC && typeof jobCardHtml==='function' && !jobCardHtml.__v280){
      var previousJobCardHtml=jobCardHtml;
      jobCardHtml=function(j){
        var html=previousJobCardHtml.apply(this,arguments);
        if(!isWorkComplete(j)||String(j&&j.card_type||'')==='mini_task') return html;
        return html.replace('class="job ', 'class="job mechanicWorkComplete ');
      };
      jobCardHtml.__v280=true;
    }

    /* Mechanic deployment: once marked work-complete, remove the job from every
       current-day planner lane without archiving/deleting it from the shared database. */
    if(IS_MECHANIC && typeof allJobsForDate==='function' && !allJobsForDate.__v280){
      var previousAllJobsForDate=allJobsForDate;
      allJobsForDate=function(){
        return previousAllJobsForDate.apply(this,arguments).filter(function(j){return !isWorkComplete(j);});
      };
      allJobsForDate.__v280=true;
    }

    /* On the mechanic deployment, closing a completed service sheet no longer asks
       for the Service Book acknowledgement. Chris still gets the existing reminder
       when he performs the final completion in Workshop Pro. */
    if(IS_MECHANIC && typeof closeServicePreviewPrompt==='function'){
      closeServicePreviewPrompt=function(){ if(typeof closeServicePreview==='function') closeServicePreview(); };
    }

    if(typeof openJobModal==='function' && !openJobModal.__v280){
      var previousOpenJobModal=openJobModal;
      openJobModal=function(id,preset){
        var result=previousOpenJobModal.apply(this,arguments);
        try {
          if(!id) return result;
          var job=liveJob(id);
          if(!job) return result;
          var foot=document.querySelector('#jobModal .modalFoot');
          if(!foot) return result;

          if(IS_MECHANIC){
            /* Mechanics must not use the management completion/invoice workflow. */
            ['markComplete','markReady','createInvoiceFromJob'].forEach(function(btnId){
              var b=document.getElementById(btnId); if(b) b.style.display='none';
            });
            if(!isWorkComplete(job) && String(job.status||'').toLowerCase()!=='completed' && !job.archived){
              var complete=document.createElement('button');
              complete.type='button';
              complete.id='v280MechanicWorkComplete';
              complete.className='btn v280MechanicComplete';
              complete.textContent='✓ Mark work complete';
              complete.onclick=function(){
                var current=liveJob(id); if(!current) return;
                current.status=WORK_COMPLETE;
                current.archived=false;
                /* Never create a final completion timestamp at the mechanic stage. */
                current.completed_at='';
                current.updated_at=new Date().toISOString();
                if(typeof updateJobQuick==='function') updateJobQuick(current);
                if(typeof closeModals==='function') closeModals();
                if(typeof render==='function') render();
              };
              foot.insertBefore(complete,foot.firstChild);
            }
          } else if(isWorkComplete(job)) {
            var back=document.createElement('button');
            back.type='button';
            back.id='v280ReturnToMechanic';
            back.className='btn v280ReturnMechanic';
            back.textContent='↩ Return to mechanic';
            back.onclick=function(){
              var current=liveJob(id); if(!current) return;
              var tech=document.getElementById('job_technician');
              var date=document.getElementById('job_booking_date');
              var time=document.getElementById('job_drop_time');
              if(tech&&tech.value) current.technician=tech.value;
              if(date&&date.value) current.booking_date=date.value;
              if(time&&time.value) current.drop_time=time.value;
              current.status='booked';
              current.archived=false;
              current.completed_at='';
              current.updated_at=new Date().toISOString();
              if(typeof updateJobQuick==='function') updateJobQuick(current);
              if(typeof closeModals==='function') closeModals();
              if(typeof render==='function') render();
            };
            foot.insertBefore(back,foot.firstChild);
          }
        } catch(e){ console.warn('V280 job-card workflow enhancement skipped',e); }
        return result;
      };
      openJobModal.__v280=true;
    }

    try {
      var footnote=document.querySelector('.sideFoot small');
      if(footnote) footnote.textContent=IS_MECHANIC?'v280 Mechanic Dashboard · staged work completion':'v280 Workshop Pro · staged mechanic completion';
    } catch(e){}
  } catch(e){
    /* This add-on must never be able to stop the core planner loading. */
    console.warn('V280 staged mechanic completion disabled safely',e);
  }
})();
