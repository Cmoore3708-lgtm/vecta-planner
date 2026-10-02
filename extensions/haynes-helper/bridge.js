(()=>{
  if(window.__vectaHaynesBridge)return;window.__vectaHaynesBridge=true;
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='vecta-haynes-request')return;
    const {id,action,payload}=event.data;
    if(typeof id!=='string'||id.length>80||!['discover','extract','ping'].includes(action))return;
    try{const result=await chrome.runtime.sendMessage({action,payload});window.postMessage({channel:'vecta-haynes-response',id,...result},location.origin);}
    catch{window.postMessage({channel:'vecta-haynes-response',id,error:'The HaynesPro helper disconnected. Reconnect it from its toolbar button.'},location.origin);}
  });
})();
