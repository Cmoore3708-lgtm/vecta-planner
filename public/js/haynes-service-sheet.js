(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mileage=sheet=>{const value=String(sheet.querySelector('.ssMileageEntry')?.textContent||'').replace(/[\s,]/g,'');return /^\d+$/.test(value)&&Number(value)>0&&Number(value)<=2000000?Number(value):0;};
const safeImage=value=>/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(value||'')?value:'';
root.initHaynesServiceSheet=async function(sheet,registration,kind){
 if(!sheet||kind!=='service')return;
 let config;try{config=await fetch('/api/supabase-config',{cache:'no-store'}).then(r=>r.json());}catch{return;}
 if(!sheet.isConnected||!config.haynesServiceTest)return;
 let panel=sheet.querySelector('.ssHaynes');
 const archived=!!panel?.querySelector('.ssHaynesColumns');
 if(!panel){panel=document.createElement('section');panel.className='ssSection ssHaynes';panel.innerHTML='<div class="ssTitle">HaynesPro service requirements</div><div class="ssHaynesStatus" role="status" aria-live="polite">Enter the current mileage to download service requirements.</div><div class="ssHaynesData"></div>';sheet.querySelector('.ssInfo')?.insertAdjacentElement('afterend',panel);}
 let picture=sheet.querySelector('.ssHaynesVehicle');
 if(!picture){picture=document.createElement('div');picture.className='ssHaynesVehicle';sheet.querySelector('.ssHeader')?.appendChild(picture);}
 const showVehicle=v=>{if(v?.registration!==registration)return;const image=safeImage(v.imageUrl);picture.innerHTML=(image?'<img src="'+esc(image)+'" alt="'+esc(v.vehicle)+'">':'')+'<strong>'+esc(v.vehicle)+'</strong><span>'+esc(v.engineCode?'Engine: '+v.engineCode:'')+'</span><span>'+esc(v.modelYears)+'</span>';sheet.classList.add('ssHasHaynesVehicle');};
 if(!archived)fetch('/api/haynes-vehicle?reg='+encodeURIComponent(registration),{cache:'no-store'}).then(r=>r.json()).then(d=>{if(sheet.isConnected&&d.status==='MATCHED')showVehicle(d.vehicle);}).catch(()=>{});
 let sequence=0,timer,period='';
 const status=panel.querySelector('.ssHaynesStatus'),body=panel.querySelector('.ssHaynesData');
 const clearAuto=()=>sheet.querySelectorAll('[data-haynes-auto]').forEach(e=>{if(e.textContent===e.getAttribute('data-haynes-auto'))e.textContent='';e.removeAttribute('data-haynes-auto');});
 async function load(){
  if(!sheet.isConnected)return;
  const run=++sequence,current=mileage(sheet);clearAuto();body.innerHTML='';panel.removeAttribute('data-confirmed');panel.setAttribute('data-mileage',String(current));
  if(!current){status.textContent='Enter the current mileage to download service requirements.';return;}
  status.textContent='Downloading HaynesPro service requirements…';
  try{
   let id='',d,until=Date.now()+95000;
   do{
    const query=new URLSearchParams({haynes:'service',reg:registration,mileage:String(current),period});if(id)query.set('id',id);
    d=await fetch('/api/availability?'+query,{cache:'no-store'}).then(r=>r.json());
    if(run!==sequence||!sheet.isConnected||mileage(sheet)!==current)return;
    if(d.status!=='PENDING')break;id=d.id||id;await new Promise(r=>setTimeout(r,1000));
   }while(Date.now()<until);
   if(d.status!=='MATCHED')throw Error(d.status);
   const data=d.result;if(data.vehicle.registration!==registration||data.mileage!==current)throw Error('MISMATCH');
   showVehicle(data.vehicle);period=data.period;
   status.textContent='HaynesPro · '+data.conditions+' · Current mileage: '+current.toLocaleString('en-GB')+' miles'+(data.ageMonths!==null?' · Age since registration: '+data.ageMonths+' months':' · Vehicle age unavailable');
   body.innerHTML='<label class="ssHaynesSelect">Service interval <select aria-label="Haynes service interval">'+data.periods.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===period?' selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select></label><p class="ssHaynesConfirm"><span class="ssTickBox" role="checkbox" tabindex="0" aria-checked="false"></span> Confirm this interval against vehicle age, usage and service history before carrying out the work.</p><div class="ssHaynesColumns"><div><b>Engine oil</b>'+ (data.oil.length?data.oil.map(o=>'<p>'+esc(o.specification||'Specification unavailable')+'<br>'+esc(o.capacity||'Capacity unavailable')+'<small>'+esc(o.applicability)+'</small></p>').join(''):'<p>Oil specification unavailable. Check Haynes before filling.</p>')+'<b>Parts for the selected schedule</b><ul>'+data.parts.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul></div><div><b>Additional intervals — check last replacement</b><ul>'+data.additional.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul></div></div><small>Retrieved '+esc(new Date(data.fetchedAt).toLocaleString('en-GB'))+' · Saved with this service sheet.</small>';
   body.querySelector('select').onchange=e=>{period=e.target.value;load();};
   const confirm=body.querySelector('[role="checkbox"]');confirm.onclick=()=>{const checked=confirm.getAttribute('aria-checked')!=='true';confirm.setAttribute('aria-checked',String(checked));confirm.classList.toggle('checked',checked);panel.setAttribute('data-confirmed',String(checked));};confirm.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();confirm.click();}};
   if(data.oil.length===1){const fields=sheet.querySelectorAll('.ssFluidsHorizontal .ssField');[data.oil[0].specification,data.oil[0].capacity].forEach((v,i)=>{if(fields[i]&&!fields[i].textContent.trim()&&v){fields[i].textContent=v;fields[i].setAttribute('data-haynes-auto',v);}});}
  }catch(e){if(run!==sequence||!sheet.isConnected)return;status.textContent=e.message==='WORKER_UPDATE_REQUIRED'?'Update the Workshop PC Haynes worker to download service requirements.':'HaynesPro service requirements unavailable. Check the PC worker and retry.';body.innerHTML='<button type="button" class="ssHaynesRefresh">Retry Haynes</button>';body.querySelector('button').onclick=load;}
 }
 const field=sheet.querySelector('.ssMileageEntry');if(field)field.addEventListener('input',()=>{sequence++;clearTimeout(timer);period='';clearAuto();body.innerHTML='';status.textContent='Mileage changed — updating Haynes requirements…';panel.removeAttribute('data-confirmed');timer=setTimeout(load,900);});
 if(archived){const select=body.querySelector('select');if(select)select.onchange=e=>{period=e.target.value;load();};const checkbox=body.querySelector('[role="checkbox"]');if(checkbox)checkbox.onclick=()=>{const checked=checkbox.getAttribute('aria-checked')!=='true';checkbox.setAttribute('aria-checked',String(checked));checkbox.classList.toggle('checked',checked);panel.setAttribute('data-confirmed',String(checked));};}
 else load();
};
})(window);
