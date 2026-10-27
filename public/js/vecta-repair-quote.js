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
  panel.innerHTML='<h3>Parts &amp; labour lookup</h3><p class="rqIntro">Sliding parts markup · Labour £50/hour · Final prices include VAT</p><div class="rqActions"><button type="button" class="btn" data-rq-find>Find parts &amp; labour</button><button type="button" class="btn" data-rq-replay hidden>Test captured FV65 JTY quote</button><button type="button" class="btn" data-rq-cancel hidden>Cancel lookup</button></div><p class="rqStatus" role="status" aria-live="polite">Choose a category and part above, then find parts &amp; labour.</p><div data-rq-result></div>';
  // Standard catalogue terms make supplier searches explicit, without parsing prose.
  var catalogue=[
   {group:'Electrical',parts:[['alternator','Alternator'],['starter-motor','Starter motor'],['battery','Battery']]},
   {group:'Brakes',parts:[['brake-pads','Brake pads','axle'],['brake-discs','Brake discs','axle'],['brake-caliper','Brake caliper','corner']]},
   {group:'Suspension & steering',parts:[['coil-spring','Coil spring','corner'],['shock-absorber','Shock absorber','corner'],['suspension-arm','Suspension arm','corner'],['track-rod-end','Track rod end','side'],['wheel-bearing','Wheel bearing','corner']]},
   {group:'Engine & cooling',parts:[['water-pump','Water pump'],['thermostat','Thermostat'],['radiator','Radiator'],['auxiliary-belt','Auxiliary drive belt']]},
   {group:'Transmission',parts:[['clutch-kit','Clutch kit'],['drive-shaft','Drive shaft','side']]},
   {group:'Filters',parts:[['oil-filter','Oil filter'],['air-filter','Air filter'],['cabin-filter','Cabin / pollen filter'],['fuel-filter','Fuel filter']]}
  ];
  var builder=document.createElement('fieldset');builder.className='rqBuilder';
  builder.innerHTML='<legend>Choose the repair</legend><div class="rqFields"><label>Category<select data-rq-category><option value="">Choose category</option>'+catalogue.map(function(c,i){return '<option value="'+i+'">'+esc(c.group)+'</option>';}).join('')+'</select></label><label>Part<select data-rq-part disabled><option value="">Choose part</option></select></label><label data-rq-axle-label hidden>Position<select data-rq-axle><option value="">Choose position</option><option value="front">Front</option><option value="rear">Rear</option></select></label><label data-rq-side-label hidden>Side<select data-rq-side><option value="">Choose side</option><option value="left">Left (passenger side)</option><option value="right">Right (driver side)</option><option value="both">Both sides</option></select></label><label>Quantity<input data-rq-quantity type="number" min="1" max="20" step="1" value="1"></label></div><p data-rq-summary>Choose a category and part. The registration comes from this quote.</p><a data-rq-supplier hidden target="_blank" rel="noopener noreferrer">Open this part search in GSF</a><small>GSF opens in a new tab. Check the selected registration there. Left and right are viewed from inside the car.</small>';
  panel.insertBefore(builder,panel.querySelector('.rqActions'));
  var category=builder.querySelector('[data-rq-category]'),partSelect=builder.querySelector('[data-rq-part]'),axle=builder.querySelector('[data-rq-axle]'),side=builder.querySelector('[data-rq-side]'),quantity=builder.querySelector('[data-rq-quantity]'),selectedPart=null;
  function selection(){return selectedPart?{partId:selectedPart[0],quantity:Number(quantity.value),axle:axle.value,side:side.value}:null;}
  function selectedWork(){return selectedPart?'Supply and fit '+[axle.value,side.value,selectedPart[1].toLowerCase()].filter(Boolean).join(' '):work.value.trim().replace(/\s+/g,' ');}
  function selectionValid(){return selectedPart&&Number.isInteger(Number(quantity.value))&&Number(quantity.value)>=1&&Number(quantity.value)<=20&&(!/axle|corner/.test(selectedPart[2]||'')||axle.value)&&(!/side|corner/.test(selectedPart[2]||'')||side.value);}
  function updateSelection(){
   selectedPart=(catalogue[Number(category.value)]||{parts:[]}).parts.find(function(p){return p[0]===partSelect.value;})||null;
   builder.querySelector('[data-rq-axle-label]').hidden=!selectedPart||!/axle|corner/.test(selectedPart[2]||'');
   builder.querySelector('[data-rq-side-label]').hidden=!selectedPart||!/side|corner/.test(selectedPart[2]||'');
   var link=builder.querySelector('[data-rq-supplier]');link.hidden=!selectedPart;
   if(selectedPart)link.href='https://trade.gsfcarparts.com/enhancedSearch/'+encodeURIComponent([axle.value,side.value,selectedPart[1]].filter(Boolean).join(' '));
   builder.querySelector('[data-rq-summary]').textContent=selectedPart?selectedWork()+' · quantity '+quantity.value:'Choose a category and part. The registration comes from this quote.';
   invalidate();
   if(selectedPart)message.textContent=selectionValid()?(selectedPart[0]==='alternator'&&Number(quantity.value)===1?'Ready to find parts & labour.':'Supplier search ready. Automatic price verification for this repair is not available yet; use the GSF search and enter checked prices below.'):'Complete the position, side and quantity for this repair.';
  }
  category.onchange=function(){partSelect.disabled=category.value==='';partSelect.innerHTML='<option value="">Choose part</option>'+(category.value===''?'':catalogue[Number(category.value)].parts.map(function(p){return '<option value="'+p[0]+'">'+esc(p[1])+'</option>';}).join(''));axle.value='';side.value='';updateSelection();};
  partSelect.onchange=function(){axle.value='';side.value='';updateSelection();};axle.onchange=updateSelection;side.onchange=updateSelection;quantity.oninput=updateSelection;
  var sections=modal.querySelector('.jobCardSections');if(sections)sections.prepend(panel);else work.closest('.jobWorkSection').appendChild(panel);
  var find=panel.querySelector('[data-rq-find]'),cancel=panel.querySelector('[data-rq-cancel]'),message=panel.querySelector('.rqStatus'),result=panel.querySelector('[data-rq-result]'),generation=0,controller=null,timer=null,quote=null,lastKey='',appliedKey='',additionalDrafts=[];
  var read=function(){return {registration:String((document.getElementById('job_registration')||{}).value||'').toUpperCase().replace(/\s/g,''),work:selectedWork(),selection:selection()};};
  var key=function(){return JSON.stringify(read());};
  function stop(){generation++;if(controller)controller.abort();controller=null;clearTimeout(timer);timer=null;find.disabled=false;cancel.hidden=true;}
  function invalidate(){stop();quote=null;result.replaceChildren();message.textContent='Vehicle or work changed. Run a new lookup.';}
  function show(q,restored){
   quote=q;var items=[{description:q.part.description+' — '+q.part.brand+' '+q.part.sku,costPence:q.part.costPence,salePence:q.partsPence,hoursMilli:q.labour.hoursMilli,source:true}].concat(additionalDrafts),revision=0;if(Array.isArray(restored)&&restored.length)items=restored.map(function(item){return Object.assign({},item)});
   message.textContent='GSF part found. Parts and labour exclude VAT; final prices include 20% VAT.';
   var partLink=typeof q.part.gsfUrl==='string'&&/^https:\/\/trade\.gsfcarparts\.com\/(?:enhancedSearch|partdetails)\/[A-Za-z0-9._-]{1,100}$/.test(q.part.gsfUrl)?q.part.gsfUrl:'';
   result.innerHTML='<div class="rqPart">'+(q.part.imageUrl?(partLink?'<a href="'+esc(partLink)+'" target="_blank" rel="noopener noreferrer" aria-label="Open GSF part '+esc(q.part.sku)+' in a new tab">':'')+'<img src="'+esc(q.part.imageUrl)+'" alt="'+esc(q.part.brand+' '+q.part.description)+'" referrerpolicy="no-referrer">'+(partLink?'</a>':''):'<span>Part photo unavailable</span>')+'<div><strong>'+esc(q.part.brand+' '+q.part.description)+'</strong><p>Part '+esc(q.part.sku)+'</p>'+(partLink?'<small>Click photo to open GSF. Quote vehicle: '+esc(q.request.registration)+'. Check the selected vehicle in GSF.</small>':'')+'<small>'+esc(q.variant)+'</small></div></div><div class="rqTableWrap" tabindex="0" role="region" aria-label="Parts and labour prices"><table class="rqTable"><thead><tr><th scope="col">Part</th><th scope="col">Parts cost price</th><th scope="col">Sale price</th><th scope="col">Labour hours</th><th scope="col">Labour cost</th><th scope="col">Final price (inc VAT)</th><th scope="col"><span class="rqRemoveLabel">Remove</span></th></tr></thead><tbody data-rq-items></tbody></table></div><div class="rqActions rqAddActions"><button type="button" class="btn" data-rq-add>Add part</button></div><small>Cost, sale and labour prices exclude VAT. Labour rounds up to 30 minutes at £50/hour. Add only additional labour for extra parts.</small><div class="rqGrandTotal"><span>Total price (inc VAT)</span><strong data-rq-total></strong></div><small data-rq-tax></small><small>Haynes time: '+(q.labour.hoursMilli/1000)+' hours · Charged time: '+(q.chargedHoursMilli/1000)+' hours (rounded up to 30 minutes)</small><small>Haynes: '+esc(q.labour.operationLabel)+' · '+esc(q.labour.operationId)+'</small><small>'+(q.previewOnly?'Evidence captured ':'Checked ')+esc(new Date(q.checkedAt).toLocaleString('en-GB'))+(q.previewOnly?' · test session ends ':' · refresh before ')+esc(new Date(q.expiresAt).toLocaleTimeString('en-GB'))+'</small><div class="rqActions"><button type="button" class="primary" data-rq-apply>Add to quote</button></div>';
   if(q.previewOnly){message.textContent='TEST REPLAY — captured 26 October 2026. Fitment and catalogue completeness remain unapproved. Save only as a test quote.';var notice=document.createElement('p');notice.className='rqIntro';notice.textContent='Captured supplier evidence, not a fresh live price. '+q.reviewReasons.join(' ');result.prepend(notice);}
   var body=result.querySelector('[data-rq-items]'),apply=result.querySelector('[data-rq-apply]');
   var image=result.querySelector('img');if(image)image.onerror=function(){var label=document.createElement('span');label.textContent='Part photo unavailable';image.replaceWith(label);};
   function saleFor(cost){return cost+Math.round((Math.min(cost,5000)*50+Math.min(Math.max(cost-5000,0),10000)*20+Math.max(cost-15000,0)*10)/100);}
   function parseInput(value,scale){if(!/^\d+(?:\.\d{1,2})?$/.test(String(value)))return null;var n=Math.round(Number(value)*scale);return Number.isSafeInteger(n)&&n>=0&&n<=10000000?n:null;}
   function totals(){
    var net=0,hours=0,valid=true;
    items.forEach(function(item,i){
     var row=body.children[i],charged=item.hoursMilli===null?null:Math.ceil(item.hoursMilli/500)*500;
     item.chargedHoursMilli=charged;item.labourPence=charged===null?null:charged*5;
     item.netPence=item.salePence===null||item.labourPence===null?null:item.salePence+item.labourPence;
     if(!item.description.trim()||item.costPence===null||item.netPence===null||charged>100000)valid=false;
     row.querySelector('[data-rq-labour]').textContent=item.labourPence===null?'—':money(item.labourPence);
     row.querySelector('[data-rq-final]').textContent=item.netPence===null?'—':money(Math.round(item.netPence*1.2));
     row.querySelector('[data-rq-charged]').textContent=charged===null?'':String(charged/1000)+' hrs charged';
     net+=item.netPence||0;hours+=charged||0;
    });
    // VAT is calculated once on the combined net amount, matching the invoice.
    var vat=Math.round(net*0.2),gross=net+vat,cumulative=0;items.forEach(function(item,i){var before=Math.round(cumulative*0.2);cumulative+=item.netPence||0;item.grossPence=item.netPence===null?null:item.netPence+Math.round(cumulative*0.2)-before;body.children[i].querySelector('[data-rq-final]').textContent=item.grossPence===null?'—':money(item.grossPence);});additionalDrafts=items.filter(function(item){return !item.source;});
    var baseNet=net;gross=Math.ceil(gross/500)*500;net=Math.round(gross/1.2);vat=gross-net;var roundingNet=net-baseNet;
    result.querySelector('[data-rq-total]').textContent=valid?money(gross):'Complete all part details';
    result.querySelector('[data-rq-tax]').textContent=valid?'Net '+money(net)+' + VAT '+money(vat)+(roundingNet?' (includes '+money(roundingNet)+' net rounding adjustment)':''):'';
    apply.disabled=!valid||!quote||Date.parse(q.expiresAt)<=Date.now();
    return {roundingNetPence:roundingNet,netPence:net,vatPence:vat,grossPence:gross,chargedHoursMilli:hours,valid:valid};
   }
   function render(){
    body.innerHTML=items.map(function(item,i){return '<tr><td><input data-rq-description aria-label="Part description '+(i+1)+'" value="'+esc(item.description)+'" placeholder="Part description">'+(item.source?'<small>GSF / Haynes</small>':'<small>Additional part · enter cost and any extra fitting time</small>')+'</td><td><input type="number" min="0" step="0.01" data-rq-cost aria-label="Parts cost price '+(i+1)+'" value="'+(item.costPence===null?'':(item.costPence/100).toFixed(2))+'"></td><td><input type="number" min="0" step="0.01" data-rq-sale aria-label="Sale price '+(i+1)+'" value="'+(item.salePence===null?'':(item.salePence/100).toFixed(2))+'"></td><td><input type="number" min="0" max="100" step="0.01" data-rq-hours aria-label="Labour hours '+(i+1)+'" value="'+(item.hoursMilli===null?'':item.hoursMilli/1000)+'"><small data-rq-charged></small></td><td data-rq-labour></td><td data-rq-final></td><td><button type="button" class="btn" data-rq-remove aria-label="Remove part '+(i+1)+'">×</button></td></tr>';}).join('');
    Array.from(body.children).forEach(function(row,i){
     var item=items[i];
     row.querySelectorAll('input').forEach(function(input){input.addEventListener('input',function(){
      if(input.hasAttribute('data-rq-description'))item.description=input.value;
      if(input.hasAttribute('data-rq-cost')){item.costPence=parseInput(input.value,100);item.salePence=item.costPence===null?null:saleFor(item.costPence);row.querySelector('[data-rq-sale]').value=item.salePence===null?'':(item.salePence/100).toFixed(2);}
      if(input.hasAttribute('data-rq-sale'))item.salePence=parseInput(input.value,100);
      if(input.hasAttribute('data-rq-hours'))item.hoursMilli=parseInput(input.value,1000);
      item.manuallyEdited=true;revision++;apply.textContent='Add to quote';totals();
     });});
     row.querySelector('[data-rq-remove]').onclick=function(){items.splice(i,1);revision++;if(!items.length)items.push({description:'',costPence:null,salePence:null,hoursMilli:0,source:false});render();};
    });totals();
   }
   result.querySelector('[data-rq-add]').onclick=function(){if(items.length>=20){message.textContent='This breakdown supports up to 20 parts.';return;}items.push({description:'',costPence:null,salePence:null,hoursMilli:0,source:false});revision++;render();body.lastElementChild.querySelector('input').focus();};
   render();
   apply.onclick=function(){
    if(!quote||key()!==lastKey||Date.parse(quote.expiresAt)<=Date.now()){invalidate();message.textContent='This price has expired or the vehicle has changed. Run a new lookup.';return;}
    var sum=totals(),applicationKey=lastKey+'|'+quote.checkedAt+'|'+revision;
    if(!sum.valid||appliedKey===applicationKey)return;
    var rows=document.getElementById('privatePricingRows'),vat=document.getElementById('job_vat_mode');
    var existing=Array.from(rows.children).filter(function(row){return !row.dataset.repairQuote&&String((row.querySelector('.privatePriceAmount')||{}).value||'').trim()!=='';});
    if(existing.length&&vat&&vat.value!=='ex_vat'){message.textContent='This quote already contains prices in a different VAT mode. Set those lines to excluding VAT before adding this breakdown.';return;}
    Array.from(rows.children).forEach(function(row){if(row.dataset.repairQuote||(!String((row.querySelector('.privatePriceDescription')||{}).value||'').trim()&&!String((row.querySelector('.privatePriceAmount')||{}).value||'').trim()))row.remove();});
    var snapshot={previewOnly:quote.previewOnly===true,evidenceCapturedAt:quote.evidenceCapturedAt||null,reviewReasons:quote.reviewReasons||[],request:quote.request,part:quote.part,labour:quote.labour,partsPence:items.reduce(function(n,x){return n+x.salePence;},0),labourPence:items.reduce(function(n,x){return n+x.labourPence;},0),chargedHoursMilli:sum.chargedHoursMilli,netPence:sum.netPence,vatPence:sum.vatPence,grossPence:sum.grossPence,roundingNetPence:sum.roundingNetPence,corePence:0,checkedAt:quote.checkedAt,expiresAt:quote.expiresAt,policy:quote.policy,items:JSON.parse(JSON.stringify(items))};
    var lines=[];items.forEach(function(item){lines.push({description:item.description,price:item.salePence/100});if(item.chargedHoursMilli>0)lines.push({description:'Fit '+item.description+' — '+(item.chargedHoursMilli/1000)+' hours at £50/hour',price:item.labourPence/100});});
    if(sum.roundingNetPence)lines.push({description:'Quote rounding adjustment',price:sum.roundingNetPence/100});
    lines.forEach(function(line){if(quote.previewOnly)line.description='TEST REPLAY — '+line.description;line.repair_quote=snapshot;var wrap=document.createElement('div');wrap.innerHTML=window.privatePricingRowHtml(line,rows.children.length);rows.appendChild(wrap.firstElementChild);});
    if(vat)vat.value='ex_vat';var hours=document.getElementById('job_estimated_hours');if(hours)hours.value=sum.chargedHoursMilli/1000;
    window.bindPrivatePricing();window.syncPrivatePricingTotal(true);appliedKey=applicationKey;apply.disabled=true;apply.textContent='Added to quote';message.textContent='Parts and labour added. Save Quote to keep this breakdown.';
   };
   timer=setTimeout(function(){if(panel.isConnected&&quote){quote=null;apply.disabled=true;message.textContent='Lookup price expired. Refresh before adding it to a quote.';}},Math.max(0,Date.parse(q.expiresAt)-Date.now()));
  }
  async function lookup(replay){
   if(selectedPart&&selectionValid()&&!work.value.trim())work.value=selectedWork();
   if(selectedPart&&!selectionValid()){message.textContent='Complete the position, side and quantity for this repair.';return;}
   if(selectedPart&&(selectedPart[0]!=='alternator'||Number(quantity.value)!==1)){message.textContent='Automatic price verification for this repair is not available yet. Open the GSF search and enter checked prices in the quote.';return;}
   stop();quote=null;result.replaceChildren();lastKey=key();var input=read(),run=generation,started=Date.now();find.disabled=true;cancel.hidden=false;
   async function poll(){
    if(run!==generation||!panel.isConnected||key()!==lastKey)return;
    message.textContent='Checking GSF availability and Haynes labour time…';controller=new AbortController();var timeout=setTimeout(function(){controller&&controller.abort();},15000);
    try{
     var r=await fetch('/api/repair-quote',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},input,replay===true?{previewReplay:true}:{})),signal:controller.signal});
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
  var replayButton=panel.querySelector('[data-rq-replay]');
  fetch('/api/repair-quote',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(data){if(panel.isConnected&&data.replayAvailable===true)replayButton.hidden=false;}).catch(function(){});
  replayButton.onclick=function(){if(read().registration!=='FV65JTY'){message.textContent='This captured test is for FV65 JTY. Enter that registration first.';return;}lookup(true);};
  var observer=new MutationObserver(function(){if(!modal.classList.contains('open')){stop();observer.disconnect();}});observer.observe(modal,{attributes:true,attributeFilter:['class']});
  find.onclick=function(){lookup(false);};cancel.onclick=function(){stop();message.textContent='Lookup cancelled.';};
  if(job&&job.customer_note&&typeof window.privatePricingItemsFromNote==='function'){var saved=window.privatePricingItemsFromNote(job.customer_note).map(function(line){return line.repair_quote;}).find(function(meta){return meta&&Array.isArray(meta.items)&&meta.items.length&&meta.request&&meta.request.registration===read().registration;});if(saved){lastKey=key();show(Object.assign({},saved,{variant:saved.part.variant||'',partsPence:saved.part.costPence,chargedHoursMilli:Math.ceil(saved.labour.hoursMilli/500)*500}),saved.items);message.textContent=(saved.previewOnly?'SAVED TEST REPLAY — not a live supplier quote. ':'')+'Saved parts and labour breakdown. Refresh supplier prices before reusing an expired lookup.';}}
  work.addEventListener('input',invalidate);var reg=document.getElementById('job_registration');if(reg){reg.addEventListener('input',function(){additionalDrafts=[];invalidate();});reg.addEventListener('change',function(){additionalDrafts=[];invalidate();});}

 }
 window.VectaRepairQuote={mount:mount};
})();

