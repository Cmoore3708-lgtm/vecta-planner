(function(root){
  'use strict';
  const rules=root.VectaVisitRules, busy=new Set();
  const selector='.job[data-job-id],.mobileJob[data-open-job],.sideJob[data-open-unallocated]';
  const launch='2026-11-18';
  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text)node.textContent=text;
    return node;
  }
  function choices(row){
    const {state,staff}=row,early=['missing','waiting','underway'];
    if(early.includes(state)||state==='checking')return [...(state==='checking'?[state]:early),staff?'create_invoice':'complete'];
    if(state==='collected')return ['collected','undo_collection'];
    return [state,...(state==='due'?['record_payment']:[]),'collected'];
  }
  const compact={missing:'Not here',waiting:'Waiting',underway:'Workshop',checking:'Done',due:'Done',paid:'Done',ready:'Done',collected:'Collected',create_invoice:'Done',complete:'Done'};
  const actions={create_invoice:'Create invoice…',record_payment:'Record payment…',undo_collection:'Undo collection',complete:'Complete job…'};
  function mount(card,row,context){
    card.dataset.visitState=row.state;
    let select=card.querySelector('.visitSelector');
    if(!select){
      select=element('select','visitSelector');
      for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','keydown','keyup'])select.addEventListener(type,event=>event.stopPropagation());
      select.addEventListener('dragstart',event=>{event.preventDefault();event.stopPropagation();});
      card.append(select);
      select.onchange=async()=>{
        const {row,context}=select.visitControl,target=select.value,job=row.job;
        select.value=row.state;
        if(target==='record_payment'){if(row.invoice)context.openInvoice(row.invoice.id);else context.paymentList();return;}
        if(target==='create_invoice'||target==='complete'){context.finish(job,target);return;}
        if(!navigator.onLine){context.notice('Reconnect to save this vehicle’s status.');return;}
        if(busy.has(job.id))return;
        busy.add(job.id);select.disabled=true;
        try{
          const response=await fetch('/api/job-progress',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'visit-status',job_id:job.id,booking_date:job.booking_date,previous_state:row.state,visit_state:target}),signal:AbortSignal.timeout(15000)});
          const data=await response.json();
          if(!response.ok||data.job?.id!==job.id)throw Error(data.error||'The workshop did not confirm the change.');
          context.apply(data.job);
        }catch(error){context.notice(error.message||'Refresh to check the saved status.');context.refresh();}
        finally{busy.delete(job.id);select.disabled=false;context.render();}
      };
    }
    const options=choices(row),signature=options.join(',');
    if(select.dataset.options!==signature){
      select.replaceChildren(...options.map(value=>new Option((row.state==='checking'&&actions[value])||compact[value]||actions[value]||rules.labels[value],value)));
      select.dataset.options=signature;
    }
    select.value=row.state;select.disabled=busy.has(row.job.id);select.visitControl={row,context};
    select.setAttribute('aria-label','Vehicle status for '+row.job.registration);
    select.title=rules.labels[row.state];
  }
  function paint(container,context){
    if(root.VECTA_MECHANIC_DEPLOYMENT||document.querySelector('meta[name="vecta-mechanic-build"]'))return;
    const today=rules.today(),existing=container.querySelector('.visitOverflow');
    if(context.date!==today){existing?.remove();for(const card of container.querySelectorAll('[data-visit-state]')){delete card.dataset.visitState;card.querySelector('.visitSelector')?.remove();}return;}
    const invoices=new Map();
    for(const invoice of context.invoices){if(!invoice.job_id)continue;const group=invoices.get(invoice.job_id)||[];group.push(invoice);invoices.set(invoice.job_id,group);}
    const rows=new Map();
    for(const job of context.jobs){
      if(!job.booking_date||job.booking_date>today||job.booking_date<launch||!job.registration||job.no_vehicle||(job.card_type&&job.card_type!=='job')||['quote','provisional','cancelled','canceled','deleted'].includes(job.status)||context.excluded(job))continue;
      const matches=(invoices.get(job.id)||[]).filter(invoice=>rules.invoiceState(invoice,job));
      const invoice=matches.find(invoice=>rules.invoiceState(invoice,job)==='due')||matches[0];
      const billing=invoice?rules.invoiceState(invoice,job):job.visit_billing,staff=context.staff(job);
      const state=rules.state(job,{today,billing,staff});
      if(job.booking_date<today&&['missing','collected'].includes(state))continue;
      rows.set(String(job.id),{job,state,invoice,staff});
    }
    const displayed=new Set();
    for(const card of container.querySelectorAll(selector)){
      const id=card.dataset.jobId||card.dataset.openJob||card.dataset.openUnallocated,row=rows.get(id);
      if(row){mount(card,row,context);displayed.add(id);}
      else if(card.dataset.visitState){delete card.dataset.visitState;card.querySelector('.visitSelector')?.remove();}
    }
    const extras=[...rows.values()].filter(row=>!displayed.has(String(row.job.id)));
    if(!extras.length){existing?.remove();return;}
    const section=existing||element('section','visitOverflow');
    if(!existing){section.append(element('h3','', 'Vehicle handover'));container.querySelector('.timeOffToolbar')?.after(section);if(!section.isConnected)container.append(section);}
    const previous=new Map([...section.querySelectorAll('[data-visit-id]')].map(card=>[card.dataset.visitId,card]));
    for(const row of extras){
      const id=String(row.job.id);let card=previous.get(id);
      if(!card){card=element('div','visitHandoverCard');card.dataset.visitId=id;const open=element('button','visitHandoverIdentity');open.type='button';open.onclick=()=>context.openJob(id);card.append(open);section.append(card);}
      const label=row.job.registration+' · '+(row.job.vehicle||'Vehicle')+(row.job.booking_date<today?' · Still on site':'');
      card.firstChild.textContent=label;card.classList.toggle('visitWebsite',context.website(row.job));mount(card,row,context);previous.delete(id);
    }
    for(const card of previous.values())card.remove();
  }
  function update(container,date,app,ui){
    if(root.VECTA_MECHANIC_DEPLOYMENT||document.querySelector('meta[name="vecta-mechanic-build"]'))return;
    paint(container,{
      date,jobs:app.jobs||[],invoices:app.invoices||[],website:ui.isWebsiteBookingJob,
      excluded:job=>ui.vectaJobIsDeletedForLists(job)||ui.isVehicleTaxJob(job),
      staff:job=>String(ui.fleetIncomeCustomerForJob(job)||job.customer_account||'Staff').toUpperCase()==='STAFF',
      finish(job,action){
        ui.openJobModal(job.id);
        const control=document.getElementById(action==='complete'?'markComplete':'createInvoiceFromJob');
        if(control&&control.style.display!=='none')control.click();
        else if(action==='create_invoice')document.getElementById('markReady')?.click();
      },
      openJob:ui.openJobModal,openInvoice:ui.openInvoice,paymentList:ui.openFinancialInvoiceList,notice:ui.showPlannerAvailabilityNotice,
      apply(saved){const job=app.jobs.find(job=>job.id===saved.id);if(job)Object.assign(job,saved);ui.saveLocal();},
      refresh:ui.scheduleCloudRefresh,render:()=>ui.render({fromCloud:true})
    });
  }
  root.VectaVisitBoard={update};
})(globalThis);
