(function(root){
 'use strict';
 const key='vecta_job_mot_advisories_v1',day=86400000;
 const plate=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 let cached={};
 try{
  const stored=JSON.parse(localStorage.getItem(key)||'{}');
  if(stored&&typeof stored==='object'&&!Array.isArray(stored)){
   cached=Object.fromEntries(Object.entries(stored).filter(([,v])=>v&&Number.isFinite(v.checked)&&Array.isArray(v.lines)));
  }
 }catch{}
 let active;
 function array(value){
  if(Array.isArray(value))return value;
  if(typeof value!=='string'||!value.trim())return [];
  try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}
  catch{return value.split(/\n+/).filter(Boolean)}
 }
 function snapshot(record){
  const tests=array(record.motTests??record.dvsa_mot_tests);
  const latest=tests.filter(t=>t&&typeof t==='object').sort((a,b)=>String(b.completedDate||'').localeCompare(String(a.completedDate||'')))[0];
  const checked=Date.parse(record.fetchedAt||record.dvsa_last_checked||'')||0;
  if(latest){
   const defects=latest.defects??latest.rfrAndComments;
   if(Array.isArray(defects))return {checked,date:String(latest.completedDate||'').slice(0,10).replace(/\./g,'-'),lines:defects.filter(x=>String(x?.type||'').toUpperCase()==='ADVISORY').map(x=>String(x.text||'').trim()).filter(Boolean)};
  }
  const notes=array(record.advisories??record.mot_advisories).map(x=>String(x||'').trim()).filter(Boolean);
  if(notes.length)return {checked,date:'',lines:notes};
  if(!latest&&((Array.isArray(record.motTests)&&!record.motTests.length)||record.mot_status==='No MOT history'))return {checked,none:true,lines:[]};
  return null;
 }
 function accept(reg,data){
  reg=plate(reg);
  if(!reg||!data||data.registration&&plate(data.registration)!==reg)return;
  const info=snapshot(data);
  if(!info)return;
  cached[reg]={...info,checked:info.checked||Date.now()};
  cached=Object.fromEntries(Object.entries(cached).sort((a,b)=>b[1].checked-a[1].checked).slice(0,150));
  try{localStorage.setItem(key,JSON.stringify(cached))}catch{}
  if(active?.matches(reg))active.draw(cached[reg]);
 }
 function mount(modal,job,{fetchVehicle,localRecords}){
  const panel=modal.querySelector('.jobMotAdvisories'),regField=modal.querySelector('#job_registration'),noVehicle=modal.querySelector('#job_no_vehicle');
  if(!panel||!regField)return;
  const body=panel.querySelector('[data-mot-history-body]');
  let timer,lastRegistration=plate(job.registration);
  const matches=reg=>panel.isConnected&&!noVehicle?.checked&&plate(regField.value)===reg;
  function draw(info,status=''){
   body.replaceChildren();
   const add=(tag,text,parent=body)=>{const el=document.createElement(tag);el.textContent=text;parent.appendChild(el);return el};
   if(info){
    if(info.date){const [year,month,date]=info.date.split('-');add('small','MOT on '+[date,month,year].join('/'))}
    if(info.lines.length){const ul=add('ul','');info.lines.forEach(text=>add('li',text,ul))}
    else add('p',info.none?'No MOT test history recorded.':'No advisories recorded on the last MOT.');
   }
   if(status)add('p',status);
  }
  function refresh(delay=0){
   clearTimeout(timer);
   const reg=plate(regField.value);
   if(reg!==lastRegistration){
    lastRegistration=reg;
    for(const field of ['mot_due','mot_status','mot_advisories','dvsa_mot_tests','dvsa_last_checked']){
     const input=modal.querySelector('#job_'+field);
     if(input)input.value=['mot_advisories','dvsa_mot_tests'].includes(field)?'[]':'';
    }
   }
   panel.hidden=!!noVehicle?.checked||!reg||job.card_type==='mini_task';
   if(panel.hidden){body.replaceChildren();return}
   const records=[job,...(localRecords||[]).filter(v=>v!==job&&plate(v.registration)===reg)];
   const saved=[cached[reg],...records.filter(v=>plate(v.registration)===reg).map(snapshot)].filter(Boolean).sort((a,b)=>b.checked-a.checked)[0];
   if(saved&&saved.checked>Date.now()-day){draw(saved);return}
   if(reg.length<2||reg.length>8){draw(null,'Enter a valid registration to check MOT history.');return}
   if(!navigator.onLine){draw(saved,saved?'Showing saved MOT history while offline.':'MOT history is unavailable while offline.');return}
   draw(saved,saved?'Updating MOT history…':'Checking MOT history…');
   timer=setTimeout(async()=>{
    if(!matches(reg))return;
    try{
     const data=await fetchVehicle(reg);
     if(!snapshot(data)||data.registration&&plate(data.registration)!==reg)throw Error('No matching MOT result');
     accept(reg,data);
    }catch(error){
     if(!matches(reg))return;
     if(error.status===404&&!saved)draw(null,'DVSA has no vehicle record for this registration.');
     else draw(cached[reg]||saved,saved?'Showing saved MOT history. DVSA is unavailable.':'MOT history is currently unavailable.');
    }
   },delay);
  }
  active={matches,draw};
  regField.addEventListener('input',()=>refresh(650));
  regField.addEventListener('change',()=>refresh(80));
  noVehicle?.addEventListener('change',()=>refresh());
  refresh();
 }
 root.VectaJobMotAdvisories={mount,accept};
})(window);
