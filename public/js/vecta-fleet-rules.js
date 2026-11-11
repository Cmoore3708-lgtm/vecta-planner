(function(root){
  'use strict';

  function maintenanceCategory(value){
    var text=String(value||'').toLowerCase();
    if(/\bdpf\b/.test(text))return 'dpf';
    if(/six[- ]?month|6[- ]?month|safety check/.test(text))return 'safety';
    if(/\bmot\b/.test(text))return 'mot';
    if(/\btax\b|road tax/.test(text))return 'tax';
    if(/service/.test(text)&&!/on[- ]?site/.test(text))return 'service';
    return text.trim();
  }

  function maintenanceKind(plan){
    var text=String(plan&&plan.type||'').toLowerCase();
    if(/\bdpf\b/.test(text))return 'dpf';
    if(text.indexOf('mot')>-1)return 'mot';
    if(text.indexOf('tax')>-1)return 'tax';
    if(text.indexOf('safety')>-1||text.indexOf('6 month')>-1||text.indexOf('six-month')>-1)return 'safety';
    if(text.indexOf('service')>-1)return 'service';
    return text||String(plan&&plan.id||'maintenance');
  }

  function isActiveVehicle(vehicle){
    return !!vehicle&&String(vehicle.status||'Active').trim().toLowerCase()!=='archived';
  }

  function dpfJob(j,typeValues,text,service){
  var dpf=/\bdpf\s+(?:regen(?:eration)?|renewal|region)\b|\bregen(?:erate|eration)?\s+(?:the\s+)?dpf\b/.test(text);
  /* Older Vehicle Record bookings assigned generic Service to every custom plan.
     A DPF-only description must not reset annual servicing; explicit combined
     services and DPF work still count towards both schedules. */
  if(dpf&&/^service$/i.test(String(j.job_type||'').trim())&&
      !/\bservic(?:e|ing)\b|\boil\s*(?:&|and)?\s*filter\b/i.test([j.work_required,j.description,j.title].join(' '))&&
      !typeValues.some(function(type){return !/^service$/i.test(String(type).trim())&&/\bservice\b/i.test(String(type));}))service=false;
    return {dpf:dpf,service:service};
  }

  function completeDpf(j,state){
    if(!j||!j.id||!state.canComplete(j)||!state.categories(j).dpf)return null;
    if(/^(?:cancelled|deleted|quote|provisional)$/i.test(String(j.status||'')))return null;
    var vehicle=state.vehicleForRegistration(j.registration||'');
    if(!vehicle||state.isRemoved(vehicle.id,'dpf'))return null;
    var completed=state.completedDate(j);
    if(!completed||completed>state.today)return null;
    var plan=(state.plans||[]).filter(function(p){return p&&p.vehicleId===vehicle.id&&String(p.status||'Active')==='Active'&&maintenanceCategory(p.type)==='dpf';})
      .sort(function(a,b){return String(a.currentDueDate||'').localeCompare(String(b.currentDueDate||''));})[0];
    if(!plan)return null;
    /* Saving/reconciling the same job must never advance another cycle. */
    var source='job:'+String(j.id),cid='job-dpf-'+String(j.id);
    if((state.completions||[]).some(function(c){return c.id===cid||(c.source===source&&c.planId===plan.id);}))return null;
    var previousDue=String(plan.currentDueDate||state.date(plan)||'').slice(0,10),interval=Number(plan.intervalMonths);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(previousDue)||!Number.isInteger(interval)||interval<1)return null;
    /* Only the current cycle can be completed early. July history cannot clear
       November, and November cannot clear the following March. */
    var daysEarly=(new Date(previousDue+'T00:00:00')-new Date(completed+'T00:00:00'))/86400000;
    if(!Number.isFinite(daysEarly)||daysEarly>31)return null;
    var nextDue=state.addMonths(previousDue,interval);
    while(nextDue&&nextDue<=completed)nextDue=state.addMonths(nextDue,interval);
    if(!nextDue)return null;
    plan.currentDueDate=nextDue;plan.targetMonth=Number(nextDue.slice(5,7));plan.manualDueDate=false;delete plan.manualDueDateUpdatedAt;
    var record={id:cid,vehicleId:vehicle.id,planId:plan.id,type:plan.type,completedDate:completed,datePrecision:'day',cycleDue:previousDue,previousDue:previousDue,nextDue:nextDue,source:source,notes:'DPF regeneration completed '+completed+' for the cycle due '+previousDue+'. Next due '+nextDue+'.'};
    state.completions.push(record);
    return record;
  }

  root.VectaFleetRules=Object.freeze({
    dpfJob:dpfJob,
    completeDpf:completeDpf,
    maintenanceCategory:maintenanceCategory,
    maintenanceKind:maintenanceKind,
    isActiveVehicle:isActiveVehicle
  });
})(typeof window!=='undefined'?window:globalThis);
