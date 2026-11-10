(function(){
  'use strict';
  const dialog=document.getElementById('portalEntryDialog'),open=document.getElementById('portalEntryLink');
  if(!dialog||!open)return;
  const form=document.getElementById('portalEntryForm'),input=document.getElementById('portalRegistration'),submit=document.getElementById('portalEntrySubmit'),status=document.getElementById('portalEntryStatus');
  let controller=null,version=0;
  function reset(){
    version++;controller?.abort();controller=null;
    form.reset();input.value='';input.disabled=false;submit.disabled=false;
    submit.textContent='Email my portal link';status.textContent='';
  }
  open.addEventListener('click',function(e){
    e.preventDefault();reset();dialog.showModal();input.focus();
  });
  document.getElementById('portalEntryClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{reset();open.focus({preventScroll:true});});
  input.addEventListener('input',()=>{input.value=input.value.toUpperCase().replace(/[^A-Z0-9 -]/g,'').slice(0,10);});
  form.addEventListener('submit',async function(e){
    e.preventDefault();if(submit.disabled)return;
    const registration=input.value.toUpperCase().replace(/[\s-]/g,'');
    if(!/^[A-Z0-9]{2,8}$/.test(registration)){status.textContent='Please enter your vehicle registration.';input.focus();return;}
    const current=++version,requestController=new AbortController();controller=requestController;
    const timeout=setTimeout(()=>requestController.abort(),20000);
    input.disabled=true;submit.disabled=true;submit.textContent='Requesting your link…';status.textContent='';
    try{
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:requestController.signal,body:JSON.stringify({action:'portal-entry',registration})});
      const result=await response.json();if(current!==version)return;
      if(!response.ok||!result.ok)throw Error(result.error||'Your link could not be requested. Please try again.');
      status.textContent=result.message;submit.textContent='Request received';
    }catch(error){
      if(current!==version)return;
      status.textContent=error.name==='AbortError'?'The connection timed out. Check your inbox before trying again.':error.message==='Failed to fetch'?'Unable to connect. Please check your connection and try again.':error.message;
      input.disabled=false;submit.disabled=false;submit.textContent='Email my portal link';
    }finally{clearTimeout(timeout);}
  });
})();
