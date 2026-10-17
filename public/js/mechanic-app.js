(() => {
  'use strict';
  const date=document.querySelector('#date'),technician=document.querySelector('#technician');
  const jobs=document.querySelector('#jobs'),message=document.querySelector('#message'),refresh=document.querySelector('#refresh');
  let rows=[],loading=false,saving=0;
  const drafts=new Map();
  date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function el(tag,text,cls) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
  function dirty(){return drafts.size>0||saving>0;}
  async function api(url,options={}) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Could not connect. Try again.');
    return result;
  }
  function render() {
    jobs.replaceChildren();
    const filtered=rows.filter(j=>!technician.value||j.technician===technician.value);
    message.textContent=filtered.length+' active '+(filtered.length===1?'job':'jobs')+' · '+date.value.split('-').reverse().join('/');
    if(!filtered.length){jobs.append(el('p','No active work booked for this selection.','empty'));return;}
    filtered.forEach(job=>{
      const card=el('article',undefined,'job'),identity=el('div',undefined,'identity');
      identity.append(el('span',job.registration||'NO REG','plate'),el('span',job.status==='in_progress'?'In progress':job.status==='arrived'?'Arrived':'Booked','status'));
      card.append(identity,el('h2',job.vehicle||'Vehicle details not recorded'),el('p',[(job.drop_time||'').slice(0,5),job.technician,job.job_type,job.estimated_hours?job.estimated_hours+' hrs':''].filter(Boolean).join(' · '),'meta'),el('p',job.work_required||'No work description recorded.','work'));
      const label=el('label','Technician notes'),notes=el('textarea');
      notes.maxLength=10000;notes.value=drafts.has(job.id)?drafts.get(job.id):job.technician_notes||'';
      label.append(notes);card.append(label);
      const actions=el('div',undefined,'actions'),save=el('button','Save notes','primary'),feedback=el('span',undefined,'feedback');
      feedback.setAttribute('role','status');
      notes.addEventListener('input',()=>{if(notes.value===(job.technician_notes||''))drafts.delete(job.id);else drafts.set(job.id,notes.value);feedback.textContent=drafts.has(job.id)?'Unsaved notes':'';});
      const start=el('button','Start work');
      async function persist(startWork) {
        saving++;notes.disabled=true;save.disabled=true;start.disabled=true;
        date.disabled=true;technician.disabled=true;refresh.disabled=true;feedback.textContent='Saving…';
        try {
          const result=await api('/api/mechanic',{method:'PATCH',headers:{'Content-Type':'application/json','X-Vecta-Mechanic':'1'},body:JSON.stringify({id:job.id,updated_at:job.updated_at,technician_notes:notes.value,...(startWork?{status:'in_progress'}:{})})});
          Object.assign(job,result.jobs[0]);drafts.delete(job.id);feedback.textContent='Saved';
          if(startWork){identity.querySelector('.status').textContent='In progress';start.remove();}
        } catch(error){feedback.textContent=error.message;}
        finally{saving--;notes.disabled=false;save.disabled=false;start.disabled=false;if(!saving){date.disabled=false;technician.disabled=false;refresh.disabled=false;}}
      }
      save.addEventListener('click',()=>persist(false));start.addEventListener('click',()=>persist(true));
      actions.append(save);if(job.status!=='in_progress')actions.append(start);actions.append(feedback);card.append(actions);jobs.append(card);
    });
  }
  async function load() {
    if(loading)return;
    loading=true;refresh.disabled=true;date.disabled=true;message.textContent='Loading workshop jobs…';
    try {
      const result=await api('/api/mechanic?date='+encodeURIComponent(date.value));rows=result.jobs;
      const selected=technician.value;technician.replaceChildren(new Option('Everyone',''));
      [...new Set(rows.map(j=>j.technician).filter(Boolean))].sort().forEach(name=>technician.add(new Option(name,name)));
      technician.value=[...technician.options].some(o=>o.value===selected)?selected:'';render();
    } catch(error){message.textContent=error.message;}
    finally{loading=false;refresh.disabled=false;date.disabled=false;}
  }
  let previousDate=date.value;
  date.addEventListener('change',()=>{if(dirty()&&!confirm('Discard unsaved notes and change date?')){date.value=previousDate;return;}drafts.clear();previousDate=date.value;jobs.replaceChildren();load();});
  technician.addEventListener('change',render);
  refresh.addEventListener('click',()=>{if(dirty()&&!confirm('Discard unsaved notes and refresh?'))return;drafts.clear();load();});
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  load();
})();
