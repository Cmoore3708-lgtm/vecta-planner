(function(root){
'use strict';
const reg=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const make=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const image=v=>/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(v||'')?v:'';
function vehicleLink(v){
 if(!/^t_\d+$/.test(v?.typeId||''))return '';
 return 'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId='+encodeURIComponent(v.typeId);
}
root.initHaynesJobTools=function(modal){
 const section=modal?.querySelector('.jobVehicleSection'),input=modal?.querySelector('#job_registration');
 if(!section||!input||section.querySelector('.haynesJobTools'))return;
 const panel=document.createElement('div');panel.className='haynesJobTools';
 panel.innerHTML='<button type="button" class="btn">Find vehicle in HaynesPro</button><span role="status" aria-live="polite"></span><div class="haynesJobVehicle"></div>';
 section.appendChild(panel);
 const button=panel.querySelector('button'),status=panel.querySelector('[role="status"]'),body=panel.querySelector('.haynesJobVehicle'),noVehicle=modal.querySelector('#job_no_vehicle');
 let sequence=0,abort;
 const current=()=>reg(input.value);
 function clear(){sequence++;abort?.abort();body.replaceChildren();status.textContent='';button.disabled=!!noVehicle?.checked;button.textContent='Find vehicle in HaynesPro';}
 input.addEventListener('input',clear);input.addEventListener('change',clear);noVehicle?.addEventListener('change',clear);clear();
 button.onclick=async()=>{
  clear();const requested=current(),expectedMake=make(modal.querySelector('#job_make')?.value);
  if(noVehicle?.checked||! /^[A-Z0-9]{2,8}$/.test(requested)){status.textContent='Enter a vehicle registration first.';return;}
  const run=sequence;abort=new AbortController();const requestAbort=abort,timeout=setTimeout(()=>requestAbort.abort(),30000);
  button.disabled=true;status.textContent='Looking up vehicle…';
  try{
   const response=await root.fetch('/api/haynes-vehicle?reg='+encodeURIComponent(requested),{signal:requestAbort.signal,cache:'no-store'}),data=await response.json(),v=data.vehicle;
   if(run!==sequence||!panel.isConnected||current()!==requested||noVehicle?.checked)return;
   if(!response.ok||data.status!=='MATCHED'||reg(v?.registration)!==requested||!v?.model||!v?.variant||!v?.make||!vehicleLink(v)||(expectedMake&&make(v.make)!==expectedMake))throw Error('UNAVAILABLE');
   const link=document.createElement('a');link.className='btn dark';link.href=vehicleLink(v);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open this vehicle in HaynesPro';
   const details=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('small');
   title.textContent=[v.make,v.model,v.variant].join(' ');note.textContent=[v.engineCode,v.modelYears].filter(Boolean).join(' · ');details.append(title,note);
   const src=image(v.imageUrl);if(src){const img=document.createElement('img');img.src=src;img.alt='Representative '+v.make+' '+v.model;img.onerror=()=>img.remove();body.appendChild(img);}
   body.append(details,link);status.textContent='Matched vehicle — check the variant before using technical data.';button.textContent='Refresh HaynesPro vehicle';
  }catch{if(run===sequence&&panel.isConnected&&current()===requested)status.textContent='HaynesPro unavailable or vehicle match uncertain. You can still save this job.';}
  finally{clearTimeout(timeout);if(run===sequence)button.disabled=!!noVehicle?.checked;}
 };
};
root.VectaHaynesJobTools={vehicleLink,safeImage:image};
})(window);
