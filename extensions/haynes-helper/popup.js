document.getElementById('connect').onclick=async()=>{
  const status=document.getElementById('status');
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab.url);if(url.protocol!=='https:'||url.hostname==='www.workshopdata.com')throw Error('Open your Vecta HTTPS page first.');
    const pattern=url.origin+'/*';
    if(!await chrome.permissions.request({origins:[pattern]}))throw Error('Website access was declined.');
    const {vectaOrigins=[]}=await chrome.storage.local.get('vectaOrigins');
    const origins=[...new Set([...vectaOrigins,url.origin])];
    await chrome.storage.local.set({vectaOrigins:origins});
    await chrome.scripting.unregisterContentScripts({ids:['vecta-haynes-bridge']}).catch(()=>{});
    await chrome.scripting.registerContentScripts([{id:'vecta-haynes-bridge',matches:origins.map(o=>o+'/*'),js:['bridge.js'],runAt:'document_idle'}]);
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['bridge.js']});
    status.textContent='Connected. Open a service sheet and choose Get service data.';
  }catch(e){status.textContent=e.message;}
};
