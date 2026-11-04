(()=>{'use strict';
 const normalise=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 function createController({getRegistration,onChange,request=fetch}={}){
  let current={registration:'',status:'idle'},sequence=0,abort;
  function emit(value){current=value;onChange?.(value);}
  function reset(){sequence++;abort?.abort();emit({registration:'',status:'idle'});}
  async function check(value){
   const registration=normalise(value);if(!/^[A-Z0-9]{5,8}$/.test(registration)){reset();return;}
   if(current.registration===registration&&['loading','booked','absent'].includes(current.status))return;
   const id=++sequence;abort?.abort();abort=new AbortController();const controller=abort;
   emit({registration,status:'loading'});
   const timer=setTimeout(()=>controller.abort(),8000);
   try{
    const response=await request('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'registration',registration}),cache:'no-store',credentials:'omit',signal:controller.signal});
    const data=await response.json();if(id!==sequence||normalise(getRegistration())!==registration)return;
    const booked=response.ok&&normalise(data.registration)===registration&&['waiting','underway','checking','ready'].includes(data.stage);
    emit({registration,status:booked?'booked':response.status===404?'absent':'unavailable'});
   }catch{if(id===sequence&&normalise(getRegistration())===registration)emit({registration,status:'unavailable'});}
   finally{clearTimeout(timer);}
  }
  return {check,reset,current:()=>current,canAdvance:()=>current.registration===normalise(getRegistration())&&['absent','unavailable'].includes(current.status)};
 }
 window.VectaBookingTracking={createController};
})();
