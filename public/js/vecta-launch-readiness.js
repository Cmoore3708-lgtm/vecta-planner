(function(root){
 'use strict';
 const clean=value=>String(value||'').trim();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function age(created,now=Date.now()){
  const at=Date.parse(created);if(!Number.isFinite(at))return 'Time not recorded';
  const minutes=Math.max(0,Math.floor((now-at)/60000));
  return minutes<1?'Just arrived':minutes<60?minutes+'m waiting':minutes<1440?Math.floor(minutes/60)+'h waiting':Math.floor(minutes/1440)+'d waiting';
 }
 function requestSummary(request){
  const amount=request.approximate_cost,hasPrice=amount!==null&&amount!==undefined&&amount!==''&&Number.isFinite(Number(amount))&&Number(amount)>=0;
  const guide=/guide price|guide total|estimated parts|price.*(?:estimate|confirm)/i.test(clean(request.work_required));
  return {guide,price:hasPrice?'£'+Number(amount).toFixed(2):'Price to check',priceLabel:guide?'Guide total · review price':'Website total',
   hours:Number(request.reserved_hours)>0?Number(request.reserved_hours):null,parts:Array.isArray(request.gsf_parts)?request.gsf_parts.length:0,
   missing:[!clean(request.phone)&&'Phone missing',!clean(request.email)&&'Email missing',!clean(request.work_required)&&'Work details missing'].filter(Boolean)};
 }
 function summaryHtml(request){
  const s=requestSummary(request);
  return '<div class="launchRequestSummary"><span class="'+(s.guide?'launchWarning':'')+'"><small>'+esc(s.priceLabel)+'</small><b>'+esc(s.price)+'</b></span><span><small>Reserved workshop time</small><b>'+esc(s.hours?s.hours+' hours':'Check duration')+'</b></span><span><small>Parts carried into job</small><b>'+s.parts+' item'+(s.parts===1?'':'s')+'</b></span><span><small>Waiting for review</small><b>'+esc(age(request.created_at))+'</b></span></div>'+(s.missing.length?'<p class="launchWarning">'+esc(s.missing.join(' · '))+'</p>':'');
 }
 function readiness(jobs,{today,nextDay,partsStatus=()=>'',motStatus=()=>null,isDeleted=()=>false}={}){
  const rows=[];
  for(const job of jobs||[]){
   if(!job||job.archived||isDeleted(job)||job.no_vehicle||job.card_type==='mini_task'||/^(completed|ready_to_invoice|cancelled|canceled|deleted)$/i.test(clean(job.status)))continue;
   if(job.card_type==='quote'||job.status==='quote')continue;
   if(![today,nextDay].includes(job.booking_date))continue;
   const issues=[],types=Array.isArray(job.job_types)?job.job_types.join('|'):clean(job.job_type),parts=partsStatus(job);
   if(job.status==='provisional')issues.push('Provisional booking: confirm attendance');
   if(!clean(job.technician)||/^unallocated$/i.test(clean(job.technician)))issues.push('Allocate a mechanic');
   if(parts==='Parts need ordering')issues.push('Parts need ordering');
   else if(parts&&parts!=='Parts here'&&parts!=='Not required')issues.push(parts);
   else if(!parts&&/service|oil.*filter|brake|tyre/i.test(types))issues.push('Check parts requirements');
   if(types.split(/[,;|]/).some(t=>/^mot(?: test)?$/i.test(t.trim()))&&!motStatus(job)?.confirmed)issues.push('Check MOT confirmation');
   if(/^staff$/i.test(clean(job.customer_account))&&(job.amount_quoted==null||job.amount_quoted===''||!Number.isFinite(Number(job.amount_quoted))))issues.push('Price to confirm');
   if(!clean(job.work_required))issues.push('Work description missing');
   rows.push({id:job.id,registration:job.registration,vehicle:job.vehicle,date:job.booking_date,technician:job.technician,issues});
  }
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||Number(!a.issues.length)-Number(!b.issues.length)||clean(a.registration).localeCompare(clean(b.registration)));
 }
 function readinessHtml(rows,nextDay){
  const needing=rows.filter(r=>r.issues.length);
  return '<section class="launchReadiness"><div class="launchReadinessHead"><div><h3>Today & next working day</h3><p>Next working day: '+esc(nextDay.split('-').reverse().join('/'))+' · '+needing.length+' job'+(needing.length===1?'':'s')+' to check</p></div><button class="btn" id="launchRefreshReadiness">Refresh</button></div><p class="launchHint">Checks use saved job, parts and MOT records. Confirm delivery times and customer arrangements separately.</p>'+
   (rows.length?rows.map(r=>'<button type="button" class="launchReadinessRow '+(r.issues.length?'needsCheck':'')+'" data-launch-job="'+esc(r.id)+'"><span><b>'+esc(r.registration||'No registration')+'</b><small>'+esc(r.date.split('-').reverse().join('/'))+' · '+esc(r.technician||'Unallocated')+'</small></span><span>'+esc(r.issues.join(' · ')||'No issues found in saved records')+'</span><strong>Open job →</strong></button>').join(''):'<p>No jobs scheduled for these days.</p>')+'</section>';
 }
 root.VectaLaunchReadiness={age,requestSummary,summaryHtml,readiness,readinessHtml};
 if(root.document){
  let health=null,checked=0,pending=null;
  function paint(){
   const node=root.document.getElementById('launchServiceStatus');if(!node)return;
   if(!root.navigator.onLine){node.textContent='Offline: showing saved bookings. Reconnect to check pricing and message delivery.';return;}
   if(!health){node.textContent='Pricing status unavailable. Refresh to check the connection.';return;}
   const p=health.pricing;
   if(!p){node.textContent='Pricing status is not available yet.';return;}
   const connected=p.working>0||Date.now()-Date.parse(p.last_seen)<45000;
   node.textContent='Live service pricing: '+(connected?'connected':'connection needs attention')+' · '+p.active+' waiting/working'+(p.active?' · oldest '+Math.ceil(p.oldest_wait_seconds/60)+' min':'')+' · '+p.requests_24h+'/'+p.daily_limit+' lookups in 24h · '+p.failed_24h+' unsuccessful. Guide prices remain available.';
   const r=health.receipts;
   node.textContent+=r?' Booking emails: '+r.pending+' queued · '+r.failed+' need attention.':' Booking email delivery status unavailable.';
   const button=root.document.createElement('button');button.type='button';button.className='btn';button.style.marginLeft='8px';button.textContent='Review email delivery';button.onclick=showReceipts;node.appendChild(button);
  }
  async function showReceipts(){
   const dialog=root.document.createElement('dialog');dialog.className='launchReceiptDialog';
   dialog.innerHTML='<h3>Booking email delivery</h3><div data-receipt-details>Loading…</div><button class="btn" data-close>Close</button>';
   dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());root.document.body.appendChild(dialog);dialog.showModal();
   const details=dialog.querySelector('[data-receipt-details]');
   try{
    const response=await root.fetch('/api/website-booking?receiptIssues=1',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();
    const data=await response.json();details.textContent='Pending emails retry automatically. For messages needing review, check delivery before contacting the customer again.';
    for(const row of data.receipts||[]){const item=root.document.createElement('p');item.className='launchReceiptItem';item.textContent=[row.registration,row.email,row.status.replace(/_/g,' '),row.error].filter(Boolean).join(' · ');details.appendChild(item);}
    if(!data.receipts?.length)details.textContent='No booking emails are waiting or need attention.';
   }catch{details.textContent='Email delivery details are unavailable. Please try again.';}
  }
  root.VectaLaunchHealth={refresh:async function(){
   if(!root.navigator.onLine){paint();return;}
   if(checked&&Date.now()-checked<30000){paint();return;}
   if(pending)return pending;
   pending=(async()=>{try{const r=await root.fetch('/api/service-price?health=1',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();health=await r.json();checked=Date.now();}catch{health=null;checked=0;}finally{pending=null;paint();}})();
   return pending;
  }};
 }
})(typeof window==='undefined'?globalThis:window);
