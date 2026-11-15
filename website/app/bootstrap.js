/* Runs before the portal reads its credential. Only an explicitly linked,
   previously verified booking is remembered; never read workshop login storage. */
(()=>{'use strict';
 const key='vecta.customer-app.booking.v1';
 const valid=value=>typeof value==='string'&&value.length<=900&&/^(?:(?:request\.)?[-\w]+\.[-\w]{43}|approval\.[a-f0-9-]{36}\.[a-f0-9-]{36})$/.test(value);
 const read=()=>{try{const value=localStorage.getItem(key);return valid(value)?value:'';}catch{return '';}};
 if(!location.hash&&read())history.replaceState(null,'','/app/booking#'+read());
 window.VectaCustomerAppLink={valid,read,save(token){if(!valid(token))return false;try{localStorage.setItem(key,token);return localStorage.getItem(key)===token;}catch{return false;}},clear(){try{localStorage.removeItem(key);}catch{}}};
 document.documentElement.classList.toggle('app-linked',!!location.hash);
})();
