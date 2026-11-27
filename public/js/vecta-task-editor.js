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
