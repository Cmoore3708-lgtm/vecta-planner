(function(root){
  'use strict';
  var title='Monthly Safety check & Clean';
  // Chris's photographed list, including the handwritten NK71 DHV.
  var registrations=Object.freeze(['OW24UFM','OV73TXM','OV73URM','OW24UFJ','OW24UFK','OY73YAD','OW24UFP','OW24UFL','OW24UFH','OW24UFR','OW24UFN','OU73UFR','NL63XDR','DX69XNS','DX69XNR','FX69XWU','NK72KSE','NK72KRX','KX18EYF','KX18EYC','NK65CTF','KX67DJJ','NK16CYO','NK71DHV']);
  var email='laura.ridley@nissan-nmuk.co.uk',marker=/\[\[VECTA_MONTHLY_POOL:([^\]]+)\]\]/g;
  function key(reg){return String(reg||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
  function member(reg){return registrations.indexOf(key(reg))>=0}
  function day(value){
    var text=String(value||''),m=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return '';
    var date=new Date(text+'T12:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text?text:'';
  }
  function londonDay(value){
    var date=value?new Date(value):new Date();if(!Number.isFinite(date.getTime()))return '';
    var parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),p={};
    parts.forEach(function(x){p[x.type]=x.value});return p.year+'-'+p.month+'-'+p.day;
  }
  function plusDays(value,n){return new Date(Date.parse(value+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
  function meta(job){
    var matches=Array.from(String(job&&job.customer_note||'').matchAll(marker));if(!matches.length)return null;
    try{var data=JSON.parse(decodeURIComponent(matches[matches.length-1][1]));return data&&data.v===1&&member(data.reg)&&key(data.reg)===key(job.registration)?data:null}catch(e){return null}
  }
  function withMeta(note,data){var clean=String(note||'').replace(marker,'').trim();return clean+(data?'\n[[VECTA_MONTHLY_POOL:'+encodeURIComponent(JSON.stringify(data))+']]':'')}
  function active(job){return !!job&&!/^(deleted|cancelled|canceled|declined|quote)$/.test(String(job.status||'').toLowerCase())&&!/\[\[VECTA_SOFT_DELETE:/i.test(String(job.customer_note||''))}
  function complete(job){return /^(completed|work_complete)$/.test(String(job&&job.status||'').toLowerCase())}
  function completionDay(job){var data=meta(job);return active(job)&&complete(job)&&data?(day(data.done)||(job.completed_at?londonDay(job.completed_at):'')):''}
  function status(reg,date,jobs,excludeId){
    date=day(date);if(!member(reg)||!date)return {state:'untracked',last:'',eligible:''};
    var same=(jobs||[]).filter(function(j){return active(j)&&key(j.registration)===key(reg)&&String(j.id)!==String(excludeId)&&meta(j)});
    var done=same.map(function(j){return {date:completionDay(j),job:j}}).filter(function(x){return x.date&&x.date<=date}).sort(function(a,b){return b.date.localeCompare(a.date)});
    var last=done[0]&&done[0].date||'',eligible=last?plusDays(last,15):'';
    var inMonth=done.find(function(x){return x.date.slice(0,7)===date.slice(0,7)});
    var booked=same.find(function(j){return !complete(j)&&day(j.booking_date)&&j.booking_date.slice(0,7)===date.slice(0,7)});
    return {state:inMonth?'completed':booked?'booked':eligible&&date<eligible?'deferred':'due',last:last,eligible:eligible,job:inMonth?inMonth.job:booked||null};
  }
  // Store with the job's existing synced note metadata. Never change price or type.
  function prepare(job,included,jobs,now){
    var result=Object.assign({},job),old=meta(job);
    if(!included||!member(job.registration)||job.no_vehicle){result.customer_note=withMeta(job.customer_note,null);return result}
    var previous=(jobs||[]).find(function(j){return String(j.id)===String(job.id)});
    var retained=old&&day(old.done)&&(!previous||complete(previous))?old.done:'';
    var done=complete(job)?(retained||londonDay(now)):'';
    result.customer_note=withMeta(job.customer_note,{v:1,reg:key(job.registration),done:done});return result;
  }
  function completionError(job,jobs){
    var date=completionDay(job);if(!date)return '';
    var state=status(job.registration,date,jobs,job.id);
    // Existing completion edits retain their date; exclude this job throughout.
    if(state.state==='completed')return 'This vehicle already has a completed '+title+' in this month.';
    if(state.eligible&&date<state.eligible)return 'The last '+title+' was '+state.last+'. The next eligible date is '+state.eligible+' (15-day minimum gap).';
    return '';
  }
  function renameLine(line){var text=String(line&&line.description||'');return /^(?:Safety check,? wash\s*&\s*(?:Hoover|hover) pool cars x23|Monthly Safety check & Clean (?:23|24) pool cars)$/i.test(text.trim())?Object.assign({},line,{description:title+' 24 pool cars'}):line}
  var api={title:title,registrations:registrations,email:email,key:key,member:member,day:day,londonDay:londonDay,plusDays:plusDays,meta:meta,withMeta:withMeta,active:active,complete:complete,completionDay:completionDay,status:status,prepare:prepare,completionError:completionError,renameLine:renameLine};
  root.VectaMonthlyPool=api;
  if(!root.document)return;
  var doc=root.document,reportMonth=londonDay().slice(0,7),reportFilter='all',reportOpen=false;
  function jobs(){return (root.app&&root.app.jobs||[]).filter(function(j){return typeof root.vectaJobIsDeletedForLists!=='function'||!root.vectaJobIsDeletedForLists(j)})}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function plate(reg){return reg.slice(0,4)+' '+reg.slice(4)}
  function display(date){return date?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):'—'}
  function hasTask(text){return String(text||'').split('\n').some(function(s){return s.trim()===title})}
  function setTask(included){
    var input=doc.getElementById('job_work_required');if(!input)return;
    if(included&&!hasTask(input.value))input.value=input.value.replace(/\s+$/,'')+(input.value.trim()?'\n':'')+title;
    if(!included)input.value=input.value.split('\n').filter(function(s){return s.trim()!==title}).join('\n');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  api.mount=function(job){
    var modal=doc.getElementById('jobModal');if(!modal)return;
    var old=modal.querySelector('#monthlyPoolBooking');if(old)old.remove();
    var work=modal.querySelector('.jobWorkSection');if(!work)return;
    var panel=doc.createElement('div');panel.id='monthlyPoolBooking';panel.className='monthlyPoolBooking';panel.hidden=true;
    panel.innerHTML='<label><input type="checkbox" id="monthlyPoolIncluded"> '+title+'</label><p id="monthlyPoolMessage"></p>';
    work.appendChild(panel);
    var checkbox=panel.querySelector('input'),message=panel.querySelector('p'),prompted={},initialReg=key(job.registration),initialMeta=meta(job),timer;
    checkbox.checked=!!initialMeta;checkbox.disabled=root.VECTA_MECHANIC_DEPLOYMENT===true;
    checkbox.addEventListener('change',function(){setTask(checkbox.checked);refresh(false)});
    function refresh(allowPrompt){
      var reg=key((doc.getElementById('job_registration')||{}).value),date=(doc.getElementById('job_booking_date')||{}).value,noVehicle=(doc.getElementById('job_no_vehicle')||{}).checked,jobStatus=(doc.getElementById('job_status')||{}).value;
      panel.hidden=!member(reg)||noVehicle||jobStatus==='quote';if(panel.hidden)return;
      if(reg!==initialReg){checkbox.checked=false;setTask(false);initialReg=reg;initialMeta=null;}
      var state=status(reg,date,jobs(),job.id),isDone=!!completionDay(job)&&key(job.registration)===reg;
      checkbox.disabled=root.VECTA_MECHANIC_DEPLOYMENT===true||isDone;
      message.textContent=isDone?'Completed '+display(completionDay(job))+'.':!day(date)?'Choose a booking date to check monthly eligibility.':state.state==='completed'?'Already completed this month on '+display(state.last)+'.':state.state==='booked'?'Already booked for '+display(state.job.booking_date)+'.':state.state==='deferred'?'Not yet eligible. Last completed '+display(state.last)+'. Eligible from '+display(state.eligible)+'.':checkbox.checked?'Included in this job. Recorded when the job is completed.':'Due for '+date.slice(0,7)+'.';
      message.textContent+=' Covered by the monthly NMUK charge.';
      var token=reg+'|'+String(date).slice(0,7);
      if(allowPrompt&&!checkbox.disabled&&!checkbox.checked&&state.state==='due'&&!prompted[token]){
        prompted[token]=true;
        if(root.confirm(plate(reg)+' requires its '+title+' for '+date.slice(0,7)+'.\n\nWould you like to add it to this booking?\n\nNo extra charge will be added.')){checkbox.checked=true;setTask(true);refresh(false)}
      }
    }
    ['job_registration','job_booking_date','job_no_vehicle','job_status'].forEach(function(id){var field=doc.getElementById(id);if(field){field.addEventListener('change',function(){refresh(true)});field.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(function(){if(modal.contains(panel)&&modal.classList.contains('open'))refresh(true)},600)})}});
    refresh(false);setTimeout(function(){if(modal.contains(panel)&&modal.classList.contains('open'))refresh(true)},250);
  };
  api.collect=function(job){var checkbox=doc.getElementById('monthlyPoolIncluded');return checkbox?prepare(job,checkbox.checked,jobs()):job};
  api.validate=function(job){var error=completionError(job,jobs());if(error){root.alert(error);return false}return true};
  function reportRows(){
    var parts=reportMonth.split('-'),end=plusDays(reportMonth+'-01',new Date(Date.UTC(Number(parts[0]),Number(parts[1]),0)).getUTCDate()-1),today=londonDay(),reference=reportMonth===today.slice(0,7)?today:end;
    return registrations.map(function(reg){var state=status(reg,reference,jobs());var vehicle=(root.fleetVehicles||[]).find(function(v){return key(v.registration)===reg});return {reg:reg,model:vehicle&&vehicle.model||'',state:state}});
  }
  api.reportHtml=function(){
    if(root.VECTA_MECHANIC_DEPLOYMENT===true)return '';
    var rows=reportRows(),completed=rows.filter(function(r){return r.state.state==='completed'}).length,booked=rows.filter(function(r){return r.state.state==='booked'}).length;
    var visible=rows.filter(function(r){return reportFilter==='all'||(reportFilter==='outstanding'?r.state.state!=='completed':r.state.state===reportFilter)});
    return '<details class="monthlyPoolReport" id="monthlyPoolReport"'+(reportOpen?' open':'')+'><summary>'+title+' · 24 pool cars <span>'+completed+' done · '+(24-completed)+' outstanding · '+booked+' booked</span></summary><div class="monthlyPoolReportBody"><div class="monthlyPoolControls"><label>Month <input id="monthlyPoolMonth" type="month" value="'+esc(reportMonth)+'"></label><label>Show <select id="monthlyPoolFilter">'+[['all','All 24 cars'],['outstanding','Outstanding'],['completed','Completed'],['booked','Booked'],['deferred','Not yet eligible']].map(function(o){return '<option value="'+o[0]+'"'+(reportFilter===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')+'</select></label></div><p>Allocated to '+email+'. Once per calendar month, with at least 15 days between completed checks. Booking alone does not count as completed.</p><div class="monthlyPoolTableWrap"><table><thead><tr><th>Registration</th><th>Vehicle</th><th>Status</th><th>Last completed</th><th>Next eligible</th><th>Job</th></tr></thead><tbody>'+visible.map(function(r){var s=r.state,label={completed:'Completed',booked:'Booked',deferred:'Not yet eligible',due:'Outstanding'}[s.state];return '<tr><td><b class="monthlyPoolPlate">'+plate(r.reg)+'</b></td><td>'+esc(r.model)+'</td><td><span class="monthlyPoolState '+s.state+'">'+label+'</span>'+(s.state==='booked'?'<small>'+display(s.job.booking_date)+'</small>':'')+'</td><td>'+display(s.last)+'</td><td>'+display(s.eligible)+'</td><td>'+(s.job?'<button type="button" class="btn" data-monthly-pool-job="'+esc(s.job.id)+'">Open job</button>':'<button type="button" class="btn" data-monthly-pool-book="'+r.reg+'">Book</button>')+'</td></tr>'}).join('')+'</tbody></table></div><p>Completion history is retained when a new month starts. Existing checks only appear here when recorded against a job with this task.</p></div></details>';
  };
  function refreshReport(){var node=doc.getElementById('monthlyPoolReport');if(node){reportOpen=node.open;node.outerHTML=api.reportHtml()}}
  doc.addEventListener('change',function(event){
    if(event.target.id==='monthlyPoolMonth'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)){reportMonth=event.target.value;refreshReport()}
    if(event.target.id==='monthlyPoolFilter'){reportFilter=event.target.value;refreshReport()}
  });
  doc.addEventListener('toggle',function(event){if(event.target.id==='monthlyPoolReport')reportOpen=event.target.open},true);
  doc.addEventListener('click',function(event){
    var button=event.target.closest('[data-monthly-pool-job],[data-monthly-pool-book]');if(!button)return;
    if(button.dataset.monthlyPoolJob){root.openJobModal(button.dataset.monthlyPoolJob);return}
    var reg=button.dataset.monthlyPoolBook,vehicle=(root.fleetVehicles||[]).find(function(v){return key(v.registration)===reg}),today=londonDay(),date=reportMonth===today.slice(0,7)?today:reportMonth+'-01';
    root.openJobModal(null,{registration:plate(reg),vehicle:vehicle&&vehicle.model||'',booking_date:date,customer_account:'NMUK',customer_name:'NMUK',nmuk_vehicle_type:'Pool',customer_email:email,technician:'Unallocated',job_type:'Other'});
  });
})(typeof window!=='undefined'?window:globalThis);
