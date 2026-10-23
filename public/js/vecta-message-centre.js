(function () {
  'use strict';
  var endpoint='/api/message-centre',queueKey='vecta:prepared-message:v1:',flushing=null;
  var labels={email:'Email',whatsapp:'WhatsApp',sms:'SMS',system:'System',prepared:'Prepared',sent:'Sent',failed:'Failed',unconfirmed:'Unconfirmed',recorded:'Recorded'};
  var types={invoice:'Invoice message',booking_confirmation:'Booking confirmation',service_reminder:'Service reminder',booking_reminder:'Booking reminder',collection:'Ready to collect',booking:'Booking record created',message:'Message'};
  function escape(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
  function date(value){return new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
  function queue(){
    try{return Object.keys(localStorage).filter(function(key){return key.indexOf(queueKey)===0}).map(function(key){try{return JSON.parse(localStorage.getItem(key))}catch(e){return null}}).filter(Boolean)}catch(e){return []}
  }
  async function request(url,options){
    var response=await fetch(url,Object.assign({credentials:'same-origin',cache:'no-store'},options));
    var result=await response.json();if(!response.ok)throw Error(result.error||'Message history is unavailable.');return result;
  }
  function notice(){
    var host=document.getElementById('vectaMessageQueueStatus');if(!host)return;
    var count=queue().length;
    host.textContent=count?count+' prepared message record'+(count===1?' is':'s are')+' waiting to save. Keep this browser’s data until they have saved.':'';
  }
  function flush(){
    if(flushing)return flushing;
    flushing=(async function(){
      var attempted=new Set(),ok=true,row;
      while((row=queue().find(function(item){return !attempted.has(item.id)}))){
        attempted.add(row.id);
        try{
          await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row),keepalive:true,signal:AbortSignal.timeout(15000)});
          localStorage.removeItem(queueKey+row.id);
        }catch(e){ok=false;}
      }
      notice();return ok;
    })().finally(function(){flushing=null;if(queue().length)setTimeout(flush,60000);});
    return flushing;
  }
  function record(context){
    var row=Object.assign({id:crypto.randomUUID(),occurred_at:new Date().toISOString(),kind:'message',registration:'',job_id:'',invoice_id:'',subject:'',recipient:''},context);
    row.registration=String(row.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!row.body||!row.recipient)return;
    try{localStorage.setItem(queueKey+row.id,JSON.stringify(row));notice();flush();}
    catch(e){
      // Still try the server when browser storage is unavailable. Never claim success.
      request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row),keepalive:true}).catch(function(){
        window.alert('The prepared message could not be recorded. Please check Message Centre before closing this page.');
      });
    }
    return row.id;
  }
  function fromUrl(value,context){
    try{
      var url=new URL(value,window.location.origin),details=Object.assign({},context);
      if(url.protocol==='mailto:'){
        details.method='email';details.recipient=decodeURIComponent(url.pathname);details.subject=url.searchParams.get('subject')||'';details.body=url.searchParams.get('body')||'';
      }else if(url.protocol==='https:'&&url.hostname==='wa.me'){
        details.method='whatsapp';details.recipient=url.pathname.replace(/^\//,'');details.body=url.searchParams.get('text')||'';
      }else return;
      return record(details);
    }catch(e){console.warn('Message record could not be prepared',e);}
  }
  function styles(){
    if(document.getElementById('vectaMessageStyles'))return;
    var el=document.createElement('style');el.id='vectaMessageStyles';el.textContent=
      '#vectaMessageCentre .messageControls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}'+
      '#vectaMessageCentre input{max-width:240px;min-width:140px}'+
      '#vectaMessageCentre .messageTableWrap{overflow-x:auto}'+
      '#vectaMessageCentre table{width:100%;border-collapse:collapse;text-align:left}'+
      '#vectaMessageCentre th,#vectaMessageCentre td{padding:13px 10px;border-bottom:1px solid #555;vertical-align:top}'+
      '#vectaMessageCentre th{font-size:12px;color:#bbb}'+
      '#vectaMessageCentre tr[data-message-id]{cursor:pointer}'+
      '#vectaMessageCentre tr[data-message-id]:hover{background:#ffffff0b}'+
      '#vectaMessageCentre .messageOpen{background:transparent;border:0;color:inherit;text-align:left;font:inherit;text-decoration:underline;cursor:pointer;padding:0}'+
      '#vectaMessageCentre .messagePlate{display:inline-block;background:#f7ce37;color:#111;font-weight:800;padding:3px 7px;border-radius:4px;white-space:nowrap}'+
      '#vectaMessageCentre .messageStatus{display:block;color:#bbb;font-size:12px;margin-top:4px}'+
      '#vectaMessageCentre .messageEmpty{padding:25px 0;color:#bbb}'+
      '#vectaMessageCentre .messageQueue{color:#f7ce37}'+
      '#vectaMessageDetail{background:#171717;color:#fff;border:1px solid #555;border-radius:14px;padding:24px;width:min(680px,calc(100vw - 32px));box-sizing:border-box;max-height:85vh;overflow:auto}'+
      '#vectaMessageDetail::backdrop{background:#000b}'+
      '#vectaMessageDetail .messageDetailHead{display:flex;gap:16px;justify-content:space-between;align-items:flex-start}'+
      '#vectaMessageDetail h2{margin:0 0 16px;font-size:22px}'+
      '#vectaMessageDetail dl{display:grid;grid-template-columns:90px 1fr;gap:8px;font-size:14px}'+
      '#vectaMessageDetail dt{color:#aaa}#vectaMessageDetail dd{margin:0;overflow-wrap:anywhere}'+
      '#vectaMessageDetail .messageText{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;border-top:1px solid #444;padding-top:18px;margin-top:18px}'+
      '@media(max-width:600px){#vectaMessageCentre th,#vectaMessageCentre td{padding:10px 5px;font-size:12px}#vectaMessageCentre .messageDate{min-width:90px}#vectaMessageCentre .messagePlate{padding:2px 4px}#vectaMessageCentre .messageOpen{min-width:100px}}';
    document.head.appendChild(el);
  }
  async function detail(id){
    var dialog=document.getElementById('vectaMessageDetail');if(dialog)dialog.remove();
    dialog=document.createElement('dialog');dialog.id='vectaMessageDetail';dialog.setAttribute('aria-label','Message details');
    dialog.innerHTML='<div class="messageDetailHead"><h2>Message</h2><button type="button" class="btn" data-message-close>Close</button></div><div data-message-detail>Loading message…</div>';
    document.body.appendChild(dialog);dialog.querySelector('[data-message-close]').onclick=function(){dialog.close();};dialog.addEventListener('close',function(){dialog.remove()});dialog.showModal();
    var target=dialog.querySelector('[data-message-detail]');
    try{
      var data=await request(endpoint+'?'+new URLSearchParams({id:id})),m=data.message;
      if(!dialog.isConnected)return;
      dialog.querySelector('h2').textContent=types[m.kind]||'Message';
      var fields=[['Vehicle',m.registration||'Account message'],['Date & time',date(m.occurred_at)],['Method',labels[m.method]||m.method],['Status',labels[m.status]||m.status],['To',m.recipient],['From',m.sender],['Subject',m.subject]];
      target.innerHTML='<dl>'+fields.filter(function(f){return f[1]}).map(function(f){return '<dt>'+escape(f[0])+'</dt><dd>'+escape(f[1])+'</dd>'}).join('')+'</dl>'+
        (m.status==='prepared'?'<p>Prepared for sending. Sending and delivery are not confirmed.</p>':'')+
        (m.status==='unconfirmed'?'<p>The email service has not confirmed the send result.</p>':'')+
        (m.kind==='booking'?'<p>This shows the job creation time and its current booking details.</p>':'')+
        '<div class="messageText">'+escape(m.content_available?m.body:'The original wording was not saved for this older email. Its send record is available above.')+'</div>';
    }catch(e){target.textContent=e.message;}
  }
  function mount(){
    var host=document.getElementById('vectaMessageCentre');if(!host||host.dataset.mounted)return;
    host.dataset.mounted='true';styles();
    host.innerHTML='<h3>Message Centre</h3><p>Messages and booking records, newest first. Click an entry to read it.</p><p class="muted">WhatsApp and mail-app messages are recorded as prepared. Replies are not connected.</p>'+
      '<form class="messageControls"><input name="registration" aria-label="Search by registration" placeholder="Search registration" autocomplete="off"><button class="btn" type="submit">Search</button><button class="btn" type="button" data-message-clear>Show all</button><button class="btn" type="button" data-message-refresh>Refresh</button></form>'+
      '<p class="messageQueue" id="vectaMessageQueueStatus" role="status"></p><div data-message-list aria-live="polite"></div><p data-message-error role="status"></p><button class="btn" type="button" data-message-more hidden>Load more</button>';
    var form=host.querySelector('form'),list=host.querySelector('[data-message-list]'),error=host.querySelector('[data-message-error]'),more=host.querySelector('[data-message-more]'),items=[],cursor=null,version=0,filter='';
    function draw(){
      list.innerHTML=items.length?'<div class="messageTableWrap"><table><thead><tr><th>Date & time</th><th>Registration</th><th>Method</th><th>Message</th></tr></thead><tbody>'+items.map(function(m){return '<tr data-message-id="'+escape(m.id)+'"><td class="messageDate">'+escape(date(m.occurred_at))+'</td><td>'+(m.registration?'<span class="messagePlate">'+escape(m.registration)+'</span>':'—')+'</td><td>'+escape(labels[m.method]||m.method)+'</td><td><button type="button" class="messageOpen" data-message-id="'+escape(m.id)+'">'+escape(types[m.kind]||m.subject||'Message')+'</button><span class="messageStatus">'+escape(labels[m.status]||m.status)+'</span></td></tr>'}).join('')+'</tbody></table></div>':'<div class="messageEmpty">No records found'+(filter?' for this registration':'')+'.</div>';
    }
    async function load(append){
      var current=++version;more.disabled=true;error.textContent='';if(!append){filter=form.elements.registration.value;items=[];cursor=null;list.textContent='Loading messages…';more.hidden=true;}
      try{
        await flush();notice();var params=new URLSearchParams();if(filter)params.set('registration',filter);if(append&&cursor)params.set('cursor',cursor);
        var data=await request(endpoint+'?'+params);
        if(!host.isConnected||current!==version)return;
        items=append?items.concat(data.messages):data.messages;cursor=data.next_cursor;draw();more.hidden=!cursor;
      }catch(e){if(current===version){error.textContent=e.message;if(!append)list.textContent='Message history could not be loaded.';}}
      finally{if(current===version)more.disabled=false;}
    }
    form.onsubmit=function(e){e.preventDefault();load(false)};
    host.querySelector('[data-message-clear]').onclick=function(){form.reset();load(false)};
    host.querySelector('[data-message-refresh]').onclick=function(){load(false)};
    more.onclick=function(){load(true)};
    list.onclick=function(e){var row=e.target.closest('[data-message-id]');if(row)detail(row.dataset.messageId)};
    load(false);
  }
  window.vectaMessages={record:record,fromUrl:fromUrl,mount:mount,flush:flush};
  window.addEventListener('online',flush);
  window.addEventListener('storage',function(e){if(e.key&&e.key.indexOf(queueKey)===0&&e.newValue)flush()});
  setTimeout(flush,0);
  // Preparation attempts are logged here; no customer messages are sent by this module.
})();
