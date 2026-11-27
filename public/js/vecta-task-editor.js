// Both forms use the same task persistence and offline queue.
window.VectaTaskEditor = {
  quickHtml() {
    return `<form class="modalCard taskModalCard" id="quickTaskForm" style="max-width:26rem">
      <div class="modalHead"><h2>Quick task</h2><button type="button" class="btn" data-close-modal>Cancel</button></div>
      <div class="modalBody"><div class="field"><label for="task_text">What needs doing?</label>
      <input type="text" id="task_text" autocomplete="off" enterkeyhint="done" required></div></div>
      <div class="modalFoot"><button class="primary" type="submit" id="saveTask">Save task</button></div>
    </form>`;
  },
  fullHtml(existing,t,m,owners,esc,extractTaskReg) {
    return '<div class="modalCard taskModalCard"><div class="modalHead"><h2>'+(existing?'Edit Task':'New Task')+'</h2><button class="btn" data-close-modal>Close</button></div><div class="modalBody"><div class="formGrid"><div class="field wide"><label>Task</label><input id="task_text" autofocus value="'+esc(t.task_text||'')+'"></div><div class="field"><label>Assigned person</label><select id="task_owner">'+owners.map(function(o){return '<option value="'+esc(o)+'" '+(o===m.owner?'selected':'')+'>'+(o?esc(o):'Unassigned')+'</option>'}).join('')+'</select></div><div class="field"><label>Scheduled time</label><input id="task_scheduled_time" type="time" value="'+esc(m.scheduled_time||'')+'"></div><div class="field"><label>Registration (optional)</label><input id="task_registration" class="plateField" value="'+esc(m.registration||extractTaskReg(t.task_text)||'')+'"></div><div class="field"><label>Vehicle (optional)</label><input id="task_vehicle" value="'+esc(m.vehicle||'')+'"></div><div class="field"><label>Deadline (optional)</label><input id="task_due" type="date" value="'+esc(m.due||'')+'"></div><div class="field"><label>Priority</label><select id="task_priority"><option value="high" '+(m.priority==='high'?'selected':'')+'>High</option><option value="normal" '+(m.priority==='normal'?'selected':'')+'>Normal</option><option value="low" '+(m.priority==='low'?'selected':'')+'>Low</option></select></div><div class="field wide"><label>Notes (optional)</label><textarea id="task_notes">'+esc(m.notes||'')+'</textarea></div>'+(m.recurrence_label?'<div class="field wide recurringTaskNotice"><b>Recurring:</b> '+esc(m.recurrence_label)+'</div>':'')+'<label class="wide"><input id="task_pinned" type="checkbox" '+(m.pinned?'checked':'')+'> Pin this task to the top</label></div></div><div class="modalFoot">'+(existing?'<button class="danger" id="deleteTask">Delete</button>':'')+'<button class="primary" id="saveTask">Save Task</button></div></div>';
  }
};

const workshopReminderClock=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
function workshopReminderMinute(date){
  const p=Object.fromEntries(workshopReminderClock.formatToParts(date).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
}
function reminderInstant(value){
  const utc=Date.parse(value+'Z');
  if(Number.isFinite(utc)){
    // During the autumn clock change use the first occurrence of a repeated minute.
    for(const candidate of [utc-3600000,utc]){
      if(workshopReminderMinute(candidate)===value)return new Date(candidate).toISOString();
    }
  }
  return null;
}
window.VectaTaskEditor.reminderControl=function(modal,task){
  if(window.VECTA_MECHANIC_DEPLOYMENT)return ()=>true;
  const section=document.createElement('details');
  section.innerHTML='<summary style="cursor:pointer;padding:8px 0">Remind me</summary><div class="field"><label for="taskReminderAt">Reminder date and time (UK)</label><input type="datetime-local" id="taskReminderAt"><small data-reminder-status></small><button type="button" class="btn small" data-enable-reminder>Enable device alerts</button></div>';
  modal.querySelector('.modalBody').append(section);
  const input=section.querySelector('input'),enable=section.querySelector('button'),status=section.querySelector('small');
  section.open=!!task.remind_at;
  if(task.remind_at)input.value=workshopReminderMinute(new Date(task.remind_at));
  const original=input.value;
  function deviceStatus(){
    const state=window.vectaPortalAlertsState?.();
    enable.hidden=!state?.canEnable;
    status.textContent=!navigator.onLine?'Phone alerts need this task to sync when you are back online.':state?.status==='enabled'?'Background alerts are enabled on this device.':state?.message||'Enable background alerts on the phone you want to receive reminders.';
  }
  section.ontoggle=deviceStatus;
  enable.onclick=async()=>{await window.vectaEnablePortalAlerts?.();deviceStatus()};
  input.oninput=()=>input.setCustomValidity('');
  return ()=>{
    if(original===input.value)return true;
    const instant=input.value?reminderInstant(input.value):null;
    if(input.value&&(!instant||Date.parse(instant)<=Date.now())){
      section.open=true;input.setCustomValidity('Choose a future UK date and time.');input.reportValidity();return false;
    }
    task.remind_at=instant;return true;
  };
};
window.VectaTaskEditor.startReminders=function(getTasks){
  if(window.VECTA_MECHANIC_DEPLOYMENT)return;
  let popup=null;
  const seen=new Set();
  function check(){
    if(document.hidden)return;
    const tasks=getTasks()||[],now=Date.now();
    const due=tasks.filter(t=>!t.done&&Date.parse(t.remind_at)<=now)
      .sort((a,b)=>Date.parse(a.remind_at)-Date.parse(b.remind_at));
    const key=t=>'vecta:task-reminder:'+t.id+':'+Date.parse(t.remind_at);
    function acknowledged(t){try{return seen.has(key(t))||localStorage.getItem(key(t))==='1'}catch{return seen.has(key(t))}}
    const requested=new URL(location.href).searchParams.get('task_reminder');
    const task=due.find(t=>t.id===requested)||due.find(t=>!acknowledged(t));
    if(popup&&popup.dataset.key!== (task&&key(task))){popup.remove();popup=null}
    if(!task||popup)return;
    const dialog=document.createElement('dialog');
    dialog.style.cssText='width:min(92vw,24rem);box-sizing:border-box;padding:18px;border:0;border-top:5px solid #bb1b24;border-radius:10px;margin:auto';
    dialog.setAttribute('aria-labelledby','taskReminderTitle');
    dialog.innerHTML='<h2 id="taskReminderTitle">Task reminder</h2><p style="overflow-wrap:anywhere;white-space:pre-wrap"></p><button class="btn primary">Got it</button>';
    dialog.querySelector('p').textContent=task.task_text;
    dialog.dataset.key=key(task);popup=dialog;
    function acknowledge(){
      seen.add(key(task));try{localStorage.setItem(key(task),'1')}catch{}
      if(requested===task.id){const url=new URL(location.href);url.searchParams.delete('task_reminder');history.replaceState(history.state,'',url);}
      dialog.remove();popup=null;check();
    }
    dialog.querySelector('button').onclick=acknowledge;
    dialog.oncancel=e=>{e.preventDefault();acknowledge()};
    document.body.append(dialog);dialog.showModal();
  }
  setInterval(check,1000);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
};
