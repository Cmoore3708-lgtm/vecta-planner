(function(){
 'use strict';
 var messages={SETUP_REQUIRED:'Automatic parts and labour lookup needs its PC setup completing.',SETTINGS_REQUIRED:'The GSF and Haynes repair lookup needs calibrating on the PC.',OFFLINE:'The repair lookup worker is offline. Start it on the workshop PC, then try again.',LOGIN_REQUIRED:'Sign in to GSF or Haynes in the repair worker’s browser on the workshop PC.',REVIEW_REQUIRED:'The vehicle variant or compatible alternators need checking. No automatic price has been added.',LABOUR_REVIEW_REQUIRED:'The Haynes replacement operation or labour time needs checking. No fitting time has been assumed.',OUT_OF_STOCK:'No confirmed compatible alternator is currently in stock.',UNSUPPORTED_OPERATION:'Start with “Supply and fit alternator”. Other repairs need their own parts and labour setup.',BUSY:'The PC is checking other quotes. Please try again shortly.',DAILY_LIMIT:'The lookup limit has been reached. Please price this quote manually.',INVALID_REQUEST:'Enter the registration and “Supply and fit alternator”.',UNAVAILABLE:'The lookup could not be completed. Please try again or price the quote manually.'};
 var money=function(p){return '£'+(p/100).toFixed(2);};
 var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 function mount(job){
  if(window.VECTA_MECHANIC_DEPLOYMENT===true)return;
  var modal=document.getElementById('jobModal'),work=document.getElementById('job_work_required'),status=document.getElementById('job_status');
  if(!modal||!work||!status||status.value!=='quote'||!document.getElementById('privatePricingRows')||document.getElementById('vectaRepairQuote'))return;
  var panel=document.createElement('section');panel.id='vectaRepairQuote';
  panel.innerHTML='<h3>Parts &amp; labour lookup</h3><p class="rqIntro">Sliding parts markup · Haynes labour at £50/hour · All prices exclude VAT</p><div class="rqActions"><button type="button" class="btn" data-rq-find>Find parts &amp; labour</button><button type="button" class="btn" data-rq-cancel hidden>Cancel lookup</button></div><p class="rqStatus" role="status" aria-live="polite">Enter “Supply and fit alternator” in Work required.</p><div data-rq-result></div>';
  work.closest('.jobWorkSection').appendChild(panel);
  var find=panel.querySelector('[data-rq-find]'),cancel=panel.querySelector('[data-rq-cancel]'),message=panel.querySelector('.rqStatus'),result=panel.querySelector('[data-rq-result]'),generation=0,controller=null,timer=null,quote=null,lastKey='',appliedKey='';
  var read=function(){return {registration:String((document.getElementById('job_registration')||{}).value||'').toUpperCase().replace(/\s/g,''),work:work.value.trim().replace(/\s+/g,' ')};};
  var key=function(){return JSON.stringify(read());};
  function stop(){generation++;if(controller)controller.abort();controller=null;clearTimeout(timer);timer=null;find.disabled=false;cancel.hidden=true;}
  function invalidate(){stop();quote=null;result.replaceChildren();message.textContent='Vehicle or work changed. Run a new lookup.';}
  function show(q){
   quote=q;message.textContent='Cheapest confirmed compatible alternator in stock. All prices exclude VAT.';
   result.innerHTML='<div class="rqPart">'+(q.part.imageUrl?'<img src="'+esc(q.part.imageUrl)+'" alt="'+esc(q.part.brand+' '+q.part.description)+'" referrerpolicy="no-referrer">':'<span>Part photo unavailable</span>')+'<div><strong>'+esc(q.part.brand+' '+q.part.description)+'</strong><p>Part '+esc(q.part.sku)+'</p><small>'+esc(q.variant)+'</small></div></div><dl class="rqPrices"><dt>GSF cost price · internal</dt><dd>'+money(q.part.costPence)+'</dd><dt>Parts markup</dt><dd>'+money(q.partsPence-q.part.costPence)+'</dd><dt>Parts selling price</dt><dd>'+money(q.partsPence)+'</dd><dt>Labour · '+(q.chargedHoursMilli/1000)+' hours × £50</dt><dd>'+money(q.labourPence)+'</dd><dt class="rqTotal">Total excluding VAT</dt><dd class="rqTotal">'+money(q.netPence)+'</dd>'+(q.corePence?'<dt>Refundable exchange surcharge</dt><dd>'+money(q.corePence)+'</dd><dt>Including surcharge, excluding VAT</dt><dd>'+money(q.payableNetPence)+'</dd>':'')+'</dl><small>Haynes time: '+(q.labour.hoursMilli/1000)+' hours · Charged time: '+(q.chargedHoursMilli/1000)+' hours (rounded up to 30 minutes)</small><small>Haynes: '+esc(q.labour.operationLabel)+' · '+esc(q.labour.operationId)+'</small><small>Checked '+esc(new Date(q.checkedAt).toLocaleString('en-GB'))+' · refresh before '+esc(new Date(q.expiresAt).toLocaleTimeString('en-GB'))+'</small><details><summary>Internal purchase cost</summary><p>'+money(q.part.costPence)+' excluding VAT · markup '+money(q.partsPence-q.part.costPence)+'</p><small>50% on the first £50, 20% on the next £100, 10% above £150.</small></details><div class="rqActions"><button type="button" class="primary" data-rq-apply>Add to quote</button></div>';
   var image=result.querySelector('img');if(image)image.onerror=function(){var label=document.createElement('span');label.textContent='Part photo unavailable';image.replaceWith(label);};
   var apply=result.querySelector('[data-rq-apply]');apply.onclick=function(){
    if(!quote||key()!==lastKey||Date.parse(quote.expiresAt)<=Date.now()){invalidate();message.textContent='This price has expired or the vehicle has changed. Run a new lookup.';return;}
    if(appliedKey===lastKey+'|'+quote.checkedAt)return;
    var rows=document.getElementById('privatePricingRows'),vat=document.getElementById('job_vat_mode');
    // Do not silently reinterpret existing gross/no-VAT lines as net lines.
    var existing=Array.from(rows.children).filter(function(row){return !row.dataset.repairQuote&&String((row.querySelector('.privatePriceAmount')||{}).value||'').trim()!=='';});
    if(existing.length&&vat&&vat.value!=='ex_vat'){message.textContent='This quote already contains prices in a different VAT mode. Set those lines to excluding VAT before adding this breakdown.';return;}
    Array.from(rows.children).forEach(function(row){if(row.dataset.repairQuote||(!String((row.querySelector('.privatePriceDescription')||{}).value||'').trim()&&!String((row.querySelector('.privatePriceAmount')||{}).value||'').trim()))row.remove();});
    var snapshot={request:quote.request,part:quote.part,labour:quote.labour,partsPence:quote.partsPence,labourPence:quote.labourPence,chargedHoursMilli:quote.chargedHoursMilli,netPence:quote.netPence,corePence:quote.corePence,checkedAt:quote.checkedAt,expiresAt:quote.expiresAt,policy:quote.policy};
    var lines=[{description:'Alternator — '+quote.part.brand+' '+quote.part.sku,price:quote.partsPence/100},{description:'Replace alternator — '+(quote.chargedHoursMilli/1000)+' hours at £50/hour',price:quote.labourPence/100}];
    if(quote.corePence)lines.push({description:'Refundable alternator exchange surcharge',price:quote.corePence/100});
    lines.forEach(function(line){line.repair_quote=snapshot;var wrap=document.createElement('div');wrap.innerHTML=window.privatePricingRowHtml(line,rows.children.length);rows.appendChild(wrap.firstElementChild);});
    if(vat)vat.value='ex_vat';var hours=document.getElementById('job_estimated_hours');if(hours)hours.value=quote.chargedHoursMilli/1000;
    window.bindPrivatePricing();window.syncPrivatePricingTotal(true);appliedKey=lastKey+'|'+quote.checkedAt;apply.disabled=true;apply.textContent='Added to quote';message.textContent='Parts and labour added. Save Quote to keep this breakdown.';
   };
   timer=setTimeout(function(){if(panel.isConnected&&quote){quote=null;var b=result.querySelector('[data-rq-apply]');if(b)b.disabled=true;message.textContent='Lookup price expired. Refresh before adding it to a quote.';}},Math.max(0,Date.parse(q.expiresAt)-Date.now()));
  }
  async function lookup(){
   stop();quote=null;result.replaceChildren();lastKey=key();var input=read(),run=generation,started=Date.now();find.disabled=true;cancel.hidden=false;
   async function poll(){
    if(run!==generation||!panel.isConnected||key()!==lastKey)return;
    message.textContent='Checking GSF availability and Haynes labour time…';controller=new AbortController();var timeout=setTimeout(function(){controller&&controller.abort();},15000);
    try{
     var r=await fetch('/api/repair-quote',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:controller.signal});
     var data=await r.json();if(run!==generation||!panel.isConnected||key()!==lastKey)return;
     if(data.status==='PENDING'&&Date.now()-started<125000){timer=setTimeout(poll,2500);return;}
     find.disabled=false;cancel.hidden=true;
     if(data.status==='MATCHED'&&data.quote&&Date.parse(data.quote.expiresAt)>Date.now())show(data.quote);
     else message.textContent=(r.status===401?'Please sign in to Workshop Pro again.':messages[data.status])||messages.UNAVAILABLE;
    }catch(e){if(run===generation&&panel.isConnected){find.disabled=false;cancel.hidden=true;message.textContent=messages.UNAVAILABLE;}}
    finally{clearTimeout(timeout);}
   }
   poll();
  }
  var observer=new MutationObserver(function(){if(!modal.classList.contains('open')){stop();observer.disconnect();}});observer.observe(modal,{attributes:true,attributeFilter:['class']});
  find.onclick=lookup;cancel.onclick=function(){stop();message.textContent='Lookup cancelled.';};
  work.addEventListener('input',invalidate);var reg=document.getElementById('job_registration');if(reg){reg.addEventListener('input',invalidate);reg.addEventListener('change',invalidate);}
  // Auto lookup after a complete supported instruction; no background lookups
  // while editing an existing saved quote or after a failed request.
  var automatic;
  work.addEventListener('input',function(){clearTimeout(automatic);automatic=setTimeout(function(){if(panel.isConnected&&/^(?:supply\s+(?:and|&)\s+fit|replace|fit|renew)\s+(?:an?\s+)?alternator[.!]?$/i.test(work.value.trim())&&read().registration.length>=2)lookup();},1000);});
 }
 window.VectaRepairQuote={mount:mount};
})();
