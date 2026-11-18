(function(root){
  'use strict';
  function create(deps){
    const {partsStatusFromJob,partsStatusClass,esc,jobParts,noteWithJobParts,partsStatusNote}=deps;
    const PARTS_STATUS_VALUES=deps.values;
    function control(j){
      if(!j||!j.id||j.card_type==='mini_task')return '';
      var status=partsStatusFromJob(j),label='Parts status for '+(j.registration||'this job')+' — '+(status||'Not set');
      var options=PARTS_STATUS_VALUES.filter(function(value){return value||!status}).map(function(value){
        return '<option value="'+esc(value)+'"'+(value===status?' selected':'')+(value?'':' disabled')+'>'+esc(value||'Select parts status')+'</option>';
      }).join('');
      return '<span class="dashboardPartsControl" title="'+esc(label)+'"><span aria-hidden="true" class="partsStatusDot cardPartsStatusDot '+(status?partsStatusClass(status):'parts-unset')+'"></span><select data-dashboard-parts="'+esc(j.id)+'" aria-label="'+esc(label)+'">'+options+'</select></span>';
    }
    var saving=new Set();
    function bind(){
      deps.document.querySelectorAll('select[data-dashboard-parts]').forEach(function(select){
        select.disabled=saving.has(select.dataset.dashboardParts);
        select.onclick=select.onpointerdown=select.onmousedown=function(event){event.stopPropagation()};
        select.ondragstart=function(event){event.preventDefault();event.stopPropagation()};
        select.onchange=function(){return save(select.dataset.dashboardParts,select.value)};
      });
    }
    async function save(id,status){
      var job=deps.jobs().find(function(row){return String(row.id)===id});
      if(!job||!status||!PARTS_STATUS_VALUES.includes(status)||saving.has(id)||partsStatusFromJob(job)===status)return;
      var before=Object.assign({},job),note=before.customer_note,parts=jobParts(before);
      if(parts.length&&status!=='Not required'){
        var allHere=parts.every(function(part){return part.arrived});
        parts.forEach(function(part){
          part.ordered=status!=='Parts need ordering';
          part.arrived=status==='Parts here'||(status==='Awaiting parts'&&!allHere&&part.arrived);
        });
        note=noteWithJobParts(note,parts);
      }
      var next=Object.assign({},before,{parts_status:status,customer_note:partsStatusNote(note,status),updated_at:new Date().toISOString()});
      saving.add(id);
      bind();
      try{
        var result=await deps.persist(next,{silent:true,jobWriteIntent:'update',expectedRemoteUpdatedAt:before.updated_at||'',expectedRemoteRow:before});
        if(Array.isArray(result)&&result.some(function(row){return row.vecta_conflict_skipped}))throw Error('This job changed on another device. Check the latest parts status and try again.');
        var current=deps.jobs().find(function(row){return String(row.id)===id});
        if(current&&(current.customer_note===before.customer_note||current.customer_note===next.customer_note)){
          current.customer_note=next.customer_note;current.parts_status=status;
          if(!current.updated_at||current.updated_at<next.updated_at)current.updated_at=next.updated_at;
          deps.saveLocal();
        }else{deps.refresh()}
      }catch(error){deps.alert(error.message||'The parts status could not be saved. Please try again.')}
      finally{
        saving.delete(id);
        deps.render();
        // The planner may reuse the card after a failed write.
        var saved=deps.jobs().find(function(row){return String(row.id)===id});
        deps.document.querySelectorAll('select[data-dashboard-parts]').forEach(function(select){
          if(select.dataset.dashboardParts===id){select.disabled=false;select.value=partsStatusFromJob(saved);}
        });
      }
    }
    function orderingCard(job){
      const items=jobParts(job).map(part=>{
        const quantity=Number(part.quantity||1)>1?' <span class="partsCompactQty">×'+esc(String(part.quantity))+'</span>':'';
        return '<label class="partsCompactItem"><span>'+esc(part.description)+quantity+'</span>'+
          '<input type="checkbox" title="Parts here" aria-label="'+esc(part.description)+' parts here" data-part-arrived="'+esc(job.id)+
          '" data-part-id="'+esc(part.id)+'" '+(part.arrived?'checked':'')+'></label>';
      }).join('');
      return '<article class="partsWorkCard"><div class="partsCompactTop">'+deps.listPlate(job.registration)+
        '<span class="partsCompactType">'+esc(deps.partsBookingType(job))+'</span></div><div class="partsCompactLine">'+items+'</div></article>';
    }
    function orderingPage(todayRows,tomorrowRows,laterRows){
      function section(title,rows,isUrgent){return '<section class="partsWorkSection '+(isUrgent?'partsTodayUrgent':'')+'"><div class="partsWorkSectionHead"><h2>'+esc(title)+(isUrgent&&rows.length?' — URGENT':'')+'</h2><span>'+rows.length+'</span></div>'+(rows.length?rows.map(orderingCard).join(''):'<div class="partsEmpty">No parts required.</div>')+'</section>'}
      return '<div class="partsPageHead"><div><h2>Parts Ordering</h2><p>Tick each part as it arrives. As soon as every part is here, the planner dot turns green and the job disappears from this list.</p></div><div class="partsLegend"><span><i class="parts-red"></i>To order</span><span><i class="parts-amber"></i>Awaiting parts</span><span><i class="parts-green"></i>Parts here</span></div></div><div class="partsWorkPage">'+section('Needed today',todayRows,true)+section('Needed tomorrow',tomorrowRows,false)+section('Later bookings',laterRows,false)+'</div>';
    }
    return {control,bind,save,orderingPage};
  }
  root.VectaDashboardParts={create};
})(typeof window!=='undefined'?window:globalThis);
