(function(root){
 'use strict';
 // Catalogue-led: these are examples and grammar rules, never a parts whitelist.
 var examples=['Front brake pads','Rear brake discs','Alternator','Starter motor','Fuel pressure regulator','ABS sensor','Front left lower suspension arm','Door lock actuator','Air conditioning compressor'];
 var normal=function(value){return String(value||'').trim().replace(/\s+/g,' ');};
 var plural=function(word){return word.endsWith('ies')?word.slice(0,-3)+'y':word.endsWith('s')&&!/(ss|abs|gas)$/.test(word)?word.slice(0,-1):word;};
 function words(value){return normal(value).toLowerCase().replace(/[-/]/g,' ').split(/\s+/).filter(function(w){return !['the','a','an','and','of','for','with'].includes(w);}).map(plural);}
 function pattern(value){return words(value).map(function(w){return '(?=[\\s\\S]*\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:s|es)?\\b)';}).join('');}
 function matchesDescription(description,query){
  var base=normal(description).split(/\s+[-–]\s+|\s*\(/)[0];
  var actual=words(base),wanted=words(query);
  if(wanted.join(' ')==='brake pad')actual=actual.filter(function(w){return w!=='set';});
  return actual.slice().sort().join(' ')===wanted.slice().sort().join(' ');
 }
 function actions(work){
  // In workshop requests, "fit" includes supplying the part unless explicitly limited.
  if(/\b(?:fit\s+only|only\s+fit)\b/i.test(work))return 'labour';
  return /\bsupply\b/i.test(work)&&!/\bfit\b/i.test(work)?'parts':'both';
 }
 function prefix(mode){return mode==='parts'?'Supply ':mode==='labour'?'Fit only ':'Supply and fit ';}
 function resolve(work){
  var mode=actions(work),value=normal(work).replace(/[.!?]$/,'').toLowerCase();
  if(!value||value.length>220||/[\n\r;]/.test(String(work))||/\b(?:if|diagnose|inspect|check|possibly|maybe|suspect|unless)\b/.test(value))return {status:'UNSUPPORTED_OPERATION'};
  // Tolerate a repeated ampersand in the action prefix only. Separators between
  // actual parts still require separate repairs rather than one guessed price.
  if(/\b(?:not|never|don't|do not|no)\s+(?:supply|fit)\b/.test(value))return {status:'UNSUPPORTED_OPERATION'};
  value=value.replace(/^(?:please\s+|(?:can|could|would)\s+you\s+|i\s+(?:need|want)\s+)+/,'').replace(/\s+please$/,'');
  value=value.replace(/^(?:(?:a\s+)?(?:price|quote)\s+(?:to|for)\s+|how\s+much\s+(?:to|for)\s+)/,'');
  var paired=false;value=value.replace(/\b(?:supply\s*(?:and|&(?:\s*&)*|[,+/])?\s*fit|fit\s*(?:and|&(?:\s*&)*|[,+/])?\s*supply)\b/,function(){paired=true;return ' ';});
  if(!paired){
   // Preserve "supply" within names such as "fuel supply pipe" after a fit action.
   if(/\bfit\b/.test(value))value=value.replace(/\bfit\b/,' ').replace(/^\s*supply\b/,' ').replace(/\s+and\s+supply(?:\s+it)?\s*$/,' ');
   else value=value.replace(/\bsupply\b/,' ');
  }
  value=normal(value).replace(/^(?:(?:replace|renew|and|to|a|an|the|new|only)\s+|[&,+/:]\s*)+/,'').replace(/(?:\s+(?:and|only|it|to be|to)|\s*[&,+/:])+$/,'');
  value=value.replace(/\b(?:n\/?s|nearside)\b/g,'left').replace(/\b(?:o\/?s|offside)\b/g,'right').replace(/[–—-]/g,' ');
  if(/(?:\band\b|[&,+])/.test(value)&&!(/\bkit\b/.test(value)))return {status:'UNSUPPORTED_OPERATION'};
  var count=value.match(/^(\d{1,2})\s+(?:x\s+)?/),quantity=count?Number(count[1]):null;
  if(count)value=value.slice(count[0].length);
  var axles=value.match(/\b(?:front|rear)\b/g)||[],sides=value.match(/\b(?:left|right)\b/g)||[];
  if(axles.length>1||sides.length>1)return {status:'POSITION_REQUIRED'};
  var axle=axles[0]||'',side=sides[0]||'';
  var part=normal(value.replace(/\b(?:front|rear|left|right)\b/g,'')).replace(/\s+/g,' ');
  if(!/^[a-z0-9][a-z0-9 /&()'.,+]*$/.test(part)||part.length<2||part.length>150||!/[a-z]/.test(part)||words(part).length>16)return {status:'UNSUPPORTED_OPERATION'};
  // Brake pads are sold as an axle set; discs are two individually priced parts.
  // Other catalogue quantities remain explicit and visible in the editor.
  var pads=/^(?:brake )?pads?$/.test(part),discs=/^(?:brake )?(?:discs?|disks?|rotors?)$/.test(part);
  if(pads)part='brake pads';if(discs)part='brake discs';
  if((pads||discs)&&!axle)return {status:'POSITION_REQUIRED',part:part,axle:'',side:side,quantity:discs?2:1};
  if((pads||discs)&&side)return {status:'AXLE_SCOPE_REQUIRED',part:part,axle:axle,side:side};
  quantity=quantity===null?(discs?2:1):quantity;
  if(quantity<1||quantity>20||pads&&quantity!==1||discs&&quantity!==2)return {status:'QUANTITY_REQUIRED',part:part,axle:axle,side:side};
  var label=[axle,side,part].filter(Boolean).join(' '),unit=pads?'axle set':discs?'disc':'item';
  return Object.assign({status:'SUPPORTED',part:part,query:part,axle:axle,side:side,quantity:quantity,operation:part==='alternator'&&!axle&&!side&&quantity===1?'alternator-replacement':'catalogue-replacement',label:label,work:prefix(mode)+(quantity!==1&&!discs?quantity+' ':'')+label,unit:unit},mode==='both'?{}:{lookup:mode});
 }
 function scope(part,axle,side,quantity,mode){return resolve(prefix(mode)+(quantity?quantity+' ':'')+[axle,side,part].filter(Boolean).join(' '));}
 root.VectaRepairScope={examples:examples,resolve:resolve,scope:scope,words:words,pattern:pattern,matchesDescription:matchesDescription,actions:actions,prefix:prefix};
})(typeof globalThis!=='undefined'?globalThis:this);

(function(){
 'use strict';
 var messages={SETUP_REQUIRED:'Automatic parts and labour lookup needs its PC setup completing.',SETTINGS_REQUIRED:'The GSF and Haynes repair lookup needs calibrating on the PC.',OFFLINE:'The repair lookup worker is offline. Start it on the workshop PC, then try again.',LOGIN_REQUIRED:'Sign in to GSF or Haynes in the repair worker’s browser on the workshop PC.',REVIEW_REQUIRED:'The vehicle variant or matching parts need checking. No automatic price has been added.',LABOUR_REVIEW_REQUIRED:'The Haynes replacement operation or labour time needs checking. No fitting time has been assumed.',OUT_OF_STOCK:'No confirmed matching part is currently in stock.',UNSUPPORTED_OPERATION:'Enter one part or kit to price, including its position. Price separate repairs individually.',BUSY:'The PC is checking other quotes. Please try again shortly.',DAILY_LIMIT:'The lookup limit has been reached. Please price this quote manually.',INVALID_REQUEST:'Enter a registration and select the repair to price.',UNAVAILABLE:'The lookup could not be completed. Please try again or price the quote manually.'};
 messages.POSITION_REQUIRED='Choose front or rear before looking up this part.';messages.AXLE_SCOPE_REQUIRED='Brake pads and discs are priced for the complete axle. Choose front or rear.';messages.QUANTITY_REQUIRED='Check the quantity: one axle set of pads or two brake discs.';messages.SIDE_REQUIRED='Choose left or right before looking up this part.';
 var money=function(p){return '£'+(p/100).toFixed(2);};
 var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 var availability=function(part){return part.inStock===false?'Out of stock — price available; confirm supply before booking.':part.inStock===true?'In stock at last check':'Availability not confirmed';};
 function mount(job,partsApi){
  if(window.VECTA_MECHANIC_DEPLOYMENT===true)return;
  var modal=document.getElementById('jobModal'),work=document.getElementById('job_work_required'),status=document.getElementById('job_status');
  if(!modal||!work||!status||['completed','ready_to_invoice','work_complete'].includes(status.value)||work.disabled||!document.getElementById('privatePricingRows')||document.getElementById('vectaRepairQuote'))return;
  var pricingApi=partsApi||window;
  var scopes=window.VectaRepairScope||globalThis.VectaRepairScope;if(!scopes)return;
  var panel=document.createElement('section');panel.id='vectaRepairQuote';
  panel.innerHTML='<h3>Parts &amp; labour lookup</h3><p class="rqIntro">Fit includes parts and fitting · Supply means parts only · Fit only means labour only</p><div class="rqSelection"><label>Part to find<input data-rq-part list="rqPartExamples" placeholder="e.g. fuel pressure regulator" autocomplete="off"><datalist id="rqPartExamples"></datalist></label><label data-rq-axle-label>Position<select data-rq-axle><option value="">Not specified</option><option value="front">Front</option><option value="rear">Rear</option></select></label><label data-rq-side-label>Side<select data-rq-side><option value="">Not specified</option><option value="left">Left / nearside</option><option value="right">Right / offside</option></select></label><label>Quantity<input data-rq-quantity type="number" min="1" max="20" step="1" value="1"></label></div><p data-rq-scope></p><div class="rqActions"><button type="button" class="btn" data-rq-find>Find GSF part</button><button type="button" class="btn" data-rq-replay hidden>Test captured FV65 JTY quote</button><button type="button" class="btn" data-rq-cancel hidden>Cancel lookup</button></div><p class="rqStatus" role="status" aria-live="polite">Type the repair in Work required, or enter any part above, then select Find GSF part.</p><div data-rq-result></div>';
  work.closest('.jobWorkSection').appendChild(panel);
  var find=panel.querySelector('[data-rq-find]'),cancel=panel.querySelector('[data-rq-cancel]'),message=panel.querySelector('.rqStatus'),result=panel.querySelector('[data-rq-result]'),generation=0,controller=null,timer=null,quote=null,lastKey='',appliedKey='',additionalDrafts=[],draftScope='',choices={};
  var partSelect=panel.querySelector('[data-rq-part]'),axleSelect=panel.querySelector('[data-rq-axle]'),sideSelect=panel.querySelector('[data-rq-side]'),quantityInput=panel.querySelector('[data-rq-quantity]'),manualScope=false,lookupMode='both';
  scopes.examples.forEach(function(label){var option=document.createElement('option');option.value=label;panel.querySelector('#rqPartExamples').appendChild(option);});
  function repairIdentity(value){var s=scopes.resolve(value);return JSON.stringify([s.part,s.axle,s.side,s.quantity]);}
  function selectedScope(){return scopes.scope(partSelect.value,axleSelect.value,sideSelect.value,Number(quantityInput.value)||0,lookupMode);}
  function scopeDisplay(){var selected=selectedScope();find.textContent=lookupMode==='labour'?'Find fitting time':'Find GSF part';panel.querySelector('[data-rq-scope]').textContent=selected.status==='SUPPORTED'?'Pricing: '+selected.label+' · '+selected.quantity+' '+selected.unit+(selected.quantity>1?'s':'')+(lookupMode==='labour'?' · Haynes fitting time':lookupMode==='parts'?' · GSF parts only':' · GSF parts and Haynes fitting'):messages[selected.status]||'Enter the part to find.';return selected;}
  function fromWork(){var selected=scopes.resolve(work.value);manualScope=false;lookupMode=selected.lookup||scopes.actions(work.value);partSelect.value=selected.part||'';axleSelect.value=selected.axle||'';sideSelect.value=selected.side||'';quantityInput.value=selected.quantity||1;scopeDisplay();}
  fromWork();
  var read=function(){return {registration:String((document.getElementById('job_registration')||{}).value||'').toUpperCase().replace(/\s/g,''),work:manualScope?selectedScope().work||'':work.value.trim().replace(/\s+/g,' '),flow:'guided-v1',choices:JSON.parse(JSON.stringify(choices))};};
  var key=function(){return JSON.stringify([read(),work.value]);};
  function stop(){generation++;if(controller)controller.abort();controller=null;clearTimeout(timer);timer=null;find.disabled=false;cancel.hidden=true;}
  function invalidate(){stop();choices={};find.textContent=lookupMode==='labour'?'Find fitting time':'Find GSF part';quote=null;result.replaceChildren();message.textContent='Vehicle or work changed. Run a new lookup.';}
  function useScope(value){var s=scopes.resolve(value);if(!s.part)return false;lookupMode=s.lookup||'both';partSelect.value=s.part;axleSelect.value=s.axle||'';sideSelect.value=s.side||'';quantityInput.value=s.quantity||1;manualScope=true;scopeDisplay();return true;}
  function showPositionChoices(selected){
   result.innerHTML='<fieldset class="rqChoices"><legend>Which position?</legend>'+['front','rear'].map(function(axis){return '<label class="rqChoice"><input type="radio" name="rqPosition" value="'+axis+'"><span>'+esc(axis+' '+selected.part)+'</span></label>';}).join('')+'</fieldset><button type="button" class="btn" data-rq-position disabled>Find this GSF part</button>';
   var next=result.querySelector('[data-rq-position]');result.querySelectorAll('input').forEach(function(r){r.onchange=function(){next.disabled=false;};});
   next.onclick=function(){var r=result.querySelector('input:checked');if(!r)return;choices={};useScope(scopes.prefix(lookupMode)+r.value+' '+selected.part);lookup(false);};
  }
  function showChoices(data){
   var haynes=data.stage.indexOf('HAYNES_')===0,part=data.selectedPart,chosen=null,run=generation,expires=Date.parse(data.checkedAt)+300000;
   var title={GSF_CATEGORY:data.selectionKind==='product'?'Choose the product and fitting position':'Which GSF description matches your part?',GSF_PART:'1. Choose the correct GSF part',HAYNES_MENU:'2. Choose the Haynes repair group',HAYNES_LABOUR:'2. Choose the correct fitting operation'}[data.stage];
   var button={GSF_CATEGORY:data.selectionKind==='product'?'Check selected product':'Use this description',GSF_PART:lookupMode==='parts'?'Use selected part':'Use selected part & find labour',HAYNES_MENU:'Show fitting operations',HAYNES_LABOUR:'Use selected labour'}[data.stage];
   if(!title||!Array.isArray(data.options))return;
   find.textContent='Refresh choices';
   message.textContent=data.options.length?'Tick the correct option, then continue.':'No matching options were returned. Try another description below.';
   result.innerHTML=(part?'<div class="rqConfirmed"><strong>GSF part selected</strong><p>'+esc(part.description+' — '+part.brand+' '+part.sku)+'</p><small>'+money(part.costPence)+' each, excluding VAT</small><strong data-rq-availability>'+esc(availability(part))+'</strong></div>':'')+'<fieldset class="rqChoices"><legend>'+title+'</legend>'+data.options.map(function(o,i){return '<label class="rqChoice"><input type="radio" name="rqSupplierChoice" value="'+i+'"><span><strong>'+esc(o.label)+'</strong><small>'+esc(o.detail)+'</small>'+(o.work&&data.stage==='GSF_PART'?'<small>'+esc(scopes.resolve(o.work).label)+'</small>':'')+(o.costPence!==undefined?'<b>'+money(o.costPence)+' each, excluding VAT</b>':'')+(data.stage==='GSF_PART'?'<strong data-rq-availability>'+esc(availability(o))+'</strong>':'')+(o.hoursMilli!==undefined?'<b>'+(o.hoursMilli/1000)+' hours</b>':'')+'</span></label>';}).join('')+'</fieldset><div class="rqActions"><button type="button" class="btn primary" data-rq-choose disabled>'+button+'</button>'+(haynes&&lookupMode!=='labour'?'<button type="button" class="btn" data-rq-change-part>Change GSF part</button>':'')+'</div><div class="rqRefine"><label>'+ (haynes?'Search Haynes using different wording':'Search GSF using different wording')+'<input data-rq-refine maxlength="150" value="'+esc(haynes?choices.labourSearch||(part?part.description:partSelect.value):partSelect.value)+'"></label><button type="button" class="btn" data-rq-search-again>Search again</button></div>';
   var next=result.querySelector('[data-rq-choose]');
   result.querySelectorAll('[name="rqSupplierChoice"]').forEach(function(input){input.onchange=function(){chosen=data.options[Number(input.value)];next.disabled=false;};});
   next.onclick=function(){
    if(!chosen||run!==generation||Date.now()>expires||key()!==lastKey){message.textContent='These choices have expired or the repair changed. Refresh the search.';next.disabled=true;return;}
    if(data.stage==='GSF_CATEGORY'){choices=chosen.categoryChoice?{gsfCategory:chosen.categoryChoice}:{};useScope(chosen.work);}
    if(data.stage==='GSF_PART'){choices=Object.assign({},choices.gsfCategory?{gsfCategory:choices.gsfCategory}:{},{part:chosen.id});useScope(chosen.work);}
    if(data.stage==='HAYNES_MENU'){choices=Object.assign({},choices,{menus:(choices.menus||[]).concat(chosen.label)});delete choices.labour;if(choices.menus.length>8){message.textContent='Try more specific Haynes wording below.';return;}}
    if(data.stage==='HAYNES_LABOUR')choices=Object.assign({},choices,{labour:chosen.id});
    lookup(false);
   };
   var change=result.querySelector('[data-rq-change-part]');if(change)change.onclick=function(){choices=choices.gsfCategory?{gsfCategory:choices.gsfCategory}:{};lookup(false);};
   result.querySelector('[data-rq-search-again]').onclick=function(){var value=result.querySelector('[data-rq-refine]').value.trim();if(!value)return;if(haynes)choices=Object.assign({},choices.gsfCategory?{gsfCategory:choices.gsfCategory}:{},{part:choices.part,labourSearch:value});else{choices={};partSelect.value=value;manualScope=true;}lookup(false);};
   timer=setTimeout(function(){if(run===generation&&panel.isConnected){next.disabled=true;message.textContent='Refresh these choices before continuing.';}},Math.max(0,expires-Date.now()));
  }
  function show(q,restored){
   quote=q;var hasPart=!!q.part,hasLabour=!!q.labour;var items=[{description:hasPart?(q.request.quantity>1?q.request.quantity+' × ':'')+q.part.description+' — '+q.part.brand+' '+q.part.sku:scopes.resolve(q.request.work).label,costPence:hasPart?q.part.costPence*q.request.quantity:0,salePence:q.partsPence,hoursMilli:hasLabour?q.labour.hoursMilli:0,source:true}].concat(additionalDrafts),revision=0;if(Array.isArray(restored)&&restored.length)items=restored.map(function(item){return Object.assign({},item)});
   message.textContent=(hasPart?(hasLabour?'Parts and fitting found.':'Part found — supply only.'):'Fitting time found — labour only.')+' Final prices include 20% VAT.';
   var partLink=hasPart&&typeof q.part.gsfUrl==='string'&&/^https:\/\/trade\.gsfcarparts\.com\/(?:enhancedSearch|partdetails)\/[A-Za-z0-9._-]{1,100}$/.test(q.part.gsfUrl)?q.part.gsfUrl:'';
   result.innerHTML=(hasPart?'<div class="rqPart">'+(q.part.imageUrl?(partLink?'<a href="'+esc(partLink)+'" target="_blank" rel="noopener noreferrer" aria-label="Open GSF part '+esc(q.part.sku)+' in a new tab">':'')+'<img src="'+esc(q.part.imageUrl)+'" alt="'+esc(q.part.brand+' '+q.part.description)+'" referrerpolicy="no-referrer">'+(partLink?'</a>':''):'<span>Part photo unavailable</span>')+'<div><strong>'+esc(q.part.brand+' '+q.part.description)+'</strong><p>Part '+esc(q.part.sku)+'</p>'+(partLink?'<small>Click photo to open GSF. Quote vehicle: '+esc(q.request.registration)+'. Check the selected vehicle in GSF.</small>':'')+'<p data-rq-availability><strong>'+esc(availability(q.part))+'</strong></p><small>'+esc(q.variant)+'</small></div></div>':'<p><strong>Fitting only</strong> · '+esc(q.variant)+'</p>')+'<div class="rqTableWrap" tabindex="0" role="region" aria-label="Parts and labour prices"><table class="rqTable"><thead><tr><th scope="col">Part</th><th scope="col">Parts cost price</th><th scope="col">Sale price</th><th scope="col">Labour hours</th><th scope="col">Labour cost</th><th scope="col">Final price (inc VAT)</th><th scope="col"><span class="rqRemoveLabel">Remove</span></th></tr></thead><tbody data-rq-items></tbody></table></div><div class="rqActions rqAddActions"><button type="button" class="btn" data-rq-add>Add part</button></div><small>Cost, sale and labour prices exclude VAT. Labour rounds up to 30 minutes at £50/hour. Add only additional labour for extra parts.</small><div class="rqGrandTotal"><span>Total price (inc VAT)</span><strong data-rq-total></strong></div><small data-rq-tax></small>'+(hasLabour?'<small>Haynes time: '+(q.labour.hoursMilli/1000)+' hours · Charged time: '+(q.chargedHoursMilli/1000)+' hours (rounded up to 30 minutes)</small><small>Haynes: '+esc(q.labour.operationLabel)+' · '+esc(q.labour.operationId)+'</small>':'<small>Supply only — no fitting time or labour charge.</small>')+'<small>'+(q.previewOnly?'Evidence captured ':'Checked ')+esc(new Date(q.checkedAt).toLocaleString('en-GB'))+(q.previewOnly?' · test session ends ':' · refresh before ')+esc(new Date(q.expiresAt).toLocaleTimeString('en-GB'))+'</small><div class="rqActions"><button type="button" class="primary" data-rq-apply>Use this price</button></div>';
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
    body.innerHTML=items.map(function(item,i){return '<tr><td><input data-rq-description aria-label="Part description '+(i+1)+'" value="'+esc(item.description)+'" placeholder="Part description">'+(item.source?'<small>'+(hasPart?(hasLabour?'GSF / Haynes':'GSF'):'Haynes')+' · '+q.request.quantity+' '+esc(scopes.resolve(q.request.work).unit||'item')+(q.request.quantity>1?'s':'')+'</small>':'<small>Additional part · enter cost and any extra fitting time</small>')+'</td><td><input type="number" min="0" step="0.01" data-rq-cost aria-label="Parts cost price '+(i+1)+'" value="'+(item.costPence===null?'':(item.costPence/100).toFixed(2))+'"></td><td><input type="number" min="0" step="0.01" data-rq-sale aria-label="Sale price '+(i+1)+'" value="'+(item.salePence===null?'':(item.salePence/100).toFixed(2))+'"></td><td><input type="number" min="0" max="100" step="0.01" data-rq-hours aria-label="Labour hours '+(i+1)+'" value="'+(item.hoursMilli===null?'':item.hoursMilli/1000)+'"><small data-rq-charged></small></td><td data-rq-labour></td><td data-rq-final></td><td><button type="button" class="btn" data-rq-remove aria-label="Remove part '+(i+1)+'">×</button></td></tr>';}).join('');
    Array.from(body.children).forEach(function(row,i){
     var item=items[i];if(item.source){if(!hasPart){row.querySelector('[data-rq-cost]').disabled=true;row.querySelector('[data-rq-sale]').disabled=true;}if(!hasLabour)row.querySelector('[data-rq-hours]').disabled=true;}
     row.querySelectorAll('input').forEach(function(input){input.addEventListener('input',function(){
      if(input.hasAttribute('data-rq-description'))item.description=input.value;
      if(input.hasAttribute('data-rq-cost')){item.costPence=parseInput(input.value,100);item.salePence=item.costPence===null?null:saleFor(item.costPence);row.querySelector('[data-rq-sale]').value=item.salePence===null?'':(item.salePence/100).toFixed(2);}
      if(input.hasAttribute('data-rq-sale'))item.salePence=parseInput(input.value,100);
      if(input.hasAttribute('data-rq-hours'))item.hoursMilli=parseInput(input.value,1000);
      item.manuallyEdited=true;revision++;apply.textContent='Use this price';totals();
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
    var replacedLabour=false,rows=document.getElementById('privatePricingRows'),vat=document.getElementById('job_vat_mode');
    var existing=Array.from(rows.children).filter(function(row){return !row.dataset.repairQuote&&Number((row.querySelector('.privatePriceAmount')||{}).value||0)!==0;});
    if(existing.length&&vat&&vat.value!=='ex_vat'){message.textContent='This quote already contains prices in a different VAT mode. Set those lines to excluding VAT before adding this breakdown.';return;}
    Array.from(rows.children).forEach(function(row){var sameRepair=false;try{var old=JSON.parse(row.dataset.repairQuote||'null');sameRepair=old&&old.request&&old.request.registration===q.request.registration&&repairIdentity(old.request.work)===repairIdentity(q.request.work);if(sameRepair&&old.chargedHoursMilli>0)replacedLabour=true;}catch(e){}if(sameRepair||((!String((row.querySelector('.privatePriceDescription')||{}).value||'').trim()||String(row.dataset.workDescription||'').trim()===q.request.work)&&!Number((row.querySelector('.privatePriceAmount')||{}).value||0)))row.remove();});
    var snapshot={previewOnly:quote.previewOnly===true,evidenceCapturedAt:quote.evidenceCapturedAt||null,reviewReasons:quote.reviewReasons||[],request:quote.request,part:quote.part,labour:quote.labour,partsPence:items.reduce(function(n,x){return n+x.salePence;},0),labourPence:items.reduce(function(n,x){return n+x.labourPence;},0),chargedHoursMilli:sum.chargedHoursMilli,netPence:sum.netPence,vatPence:sum.vatPence,grossPence:sum.grossPence,roundingNetPence:sum.roundingNetPence,corePence:0,checkedAt:quote.checkedAt,expiresAt:quote.expiresAt,policy:quote.policy,items:JSON.parse(JSON.stringify(items))};
    var lines=[];items.forEach(function(item){if(!item.source||hasPart)lines.push({description:item.description,price:item.salePence/100});if(item.chargedHoursMilli>0)lines.push({description:'Fit '+item.description+' — '+(item.chargedHoursMilli/1000)+' hours at £50/hour',price:item.labourPence/100});});
    if(sum.roundingNetPence)lines.push({description:'Quote rounding adjustment',price:sum.roundingNetPence/100});
    lines.forEach(function(line){if(quote.previewOnly)line.description='TEST REPLAY — '+line.description;line.repair_quote=snapshot;var wrap=document.createElement('div');wrap.innerHTML=pricingApi.privatePricingRowHtml(line,rows.children.length);rows.appendChild(wrap.firstElementChild);});
    if(vat)vat.value='ex_vat';var hours=document.getElementById('job_estimated_hours');if(hours&&(hasLabour||replacedLabour)){var seen=new Set(),totalHours=0;Array.from(rows.children).forEach(function(row){try{var meta=JSON.parse(row.dataset.repairQuote||'null');if(meta&&meta.request){var identity=meta.request.registration+'|'+scopes.resolve(meta.request.work).work;if(!seen.has(identity)){seen.add(identity);totalHours+=meta.chargedHoursMilli||0;}}}catch(e){}});hours.value=totalHours/1000;}
    if(partsApi&&document.getElementById('jobPartsEditor')){
     var currentScope=scopes.resolve(q.request.work),partKeys=['both','parts','labour'].map(function(mode){return 'repair-'+encodeURIComponent(scopes.scope(currentScope.part,currentScope.axle,currentScope.side,currentScope.quantity,mode).work);}),partKey=partKeys[0],oldParts=partsApi.gatherJobPartsEditor();
     var retained=oldParts.filter(function(p){return partKeys.indexOf(p.id)<0||p.ordered||p.arrived;});
     if(hasPart&&items.some(function(p){return p.source;})&&!retained.some(function(p){return partKeys.indexOf(p.id)>=0;}))retained.push({id:partKey,description:q.part.description+' — '+q.part.brand+' '+q.part.sku,quantity:q.request.quantity,cost_price:items[0]&&items[0].source?items[0].costPence/q.request.quantity/100:q.part.costPence/100,ordered:false,arrived:false});
     var partsHolder=document.createElement('div');partsHolder.innerHTML=partsApi.jobPartsEditorHtml({customer_note:'[[JOB_PARTS_URI:'+encodeURIComponent(JSON.stringify(retained))+']]'});
     document.getElementById('jobPartsEditor').innerHTML=partsHolder.querySelector('#jobPartsEditor').innerHTML;partsApi.bindJobPartsEditor();
    }
    pricingApi.bindPrivatePricing();pricingApi.syncPrivatePricingTotal(true);appliedKey=applicationKey;apply.disabled=true;apply.textContent='Price added';message.textContent=(hasPart?(hasLabour?'Parts and labour':'Parts'):'Labour')+' added. Save the '+(status.value==='quote'?'quote':'job')+' to keep this breakdown.';
   };
   timer=setTimeout(function(){if(panel.isConnected&&quote){quote=null;apply.disabled=true;message.textContent='Lookup price expired. Refresh before adding it to a quote.';}},Math.max(0,Date.parse(q.expiresAt)-Date.now()));
  }
  async function lookup(replay){
   if(replay!==true){var selected=manualScope?selectedScope():scopes.resolve(work.value);if(selected.status!=='SUPPORTED'){message.textContent=messages[selected.status]||messages.UNSUPPORTED_OPERATION;scopeDisplay();if(selected.status==='POSITION_REQUIRED'&&selected.part)showPositionChoices(selected);else{message.textContent='Check the part description above, then search. Use one repair at a time; fit includes parts and fitting; use fit only for labour alone.';partSelect.focus();}return;}}
   stop();quote=null;result.replaceChildren();lastKey=key();var input=read(),run=generation,started=Date.now();var nextScope=scopes.resolve(input.work).work;if(nextScope!==draftScope)additionalDrafts=[];draftScope=nextScope;find.disabled=true;cancel.hidden=false;
   async function poll(){
    if(run!==generation||!panel.isConnected||key()!==lastKey)return;
    message.textContent=lookupMode==='labour'?'Finding Haynes fitting operations…':lookupMode==='parts'?'Finding GSF parts…':input.choices.part?'Checking the selected GSF part, then finding its fitting operations in Haynes…':'Finding GSF parts for '+(scopes.resolve(input.work).label||'this repair')+'…';controller=new AbortController();var timeout=setTimeout(function(){controller&&controller.abort();},15000);
    try{
     var r=await fetch('/api/repair-quote',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},input,replay===true?{previewReplay:true}:{})),signal:controller.signal});
     var data=await r.json();if(run!==generation||!panel.isConnected||key()!==lastKey)return;
     if(data.status==='PENDING'&&Date.now()-started<125000){timer=setTimeout(poll,2500);return;}
     find.disabled=false;cancel.hidden=true;
     if(data.status==='CHOICE_REQUIRED'&&data.choices)showChoices(data.choices);
     else if(data.status==='MATCHED'&&data.quote&&Date.parse(data.quote.expiresAt)>Date.now())show(data.quote);
     else message.textContent=(r.status===401?'Please sign in to Workshop Pro again.':messages[data.status])||messages.UNAVAILABLE;
    }catch(e){if(run===generation&&panel.isConnected){find.disabled=false;cancel.hidden=true;message.textContent=messages.UNAVAILABLE;}}
    finally{clearTimeout(timeout);}
   }
   poll();
  }
  var replayButton=panel.querySelector('[data-rq-replay]');
  fetch('/api/repair-quote',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(data){if(panel.isConnected&&data.replayAvailable===true&&typeof location!=='undefined'&&new URLSearchParams(location.search).has('repairReplay'))replayButton.hidden=false;}).catch(function(){});
  replayButton.onclick=function(){if(read().registration!=='FV65JTY'){message.textContent='This captured test is for FV65 JTY. Enter that registration first.';return;}lookup(true);};
  var observer=new MutationObserver(function(){if(!modal.classList.contains('open')){stop();clearTimeout(automatic);observer.disconnect();}});observer.observe(modal,{attributes:true,attributeFilter:['class']});
  find.onclick=function(){lookup(false);};cancel.onclick=function(){stop();message.textContent='Lookup cancelled.';};
  if(job&&job.customer_note&&typeof pricingApi.privatePricingItemsFromNote==='function'){var saved=pricingApi.privatePricingItemsFromNote(job.customer_note).map(function(line){return line.repair_quote;}).find(function(meta){return meta&&Array.isArray(meta.items)&&meta.items.length&&meta.request&&meta.request.registration===read().registration;});if(saved){choices=saved.request.choices||{};draftScope=scopes.resolve(saved.request.work).work;var savedScope=scopes.resolve(saved.request.work);if(savedScope.status==='SUPPORTED'){lookupMode=savedScope.lookup||'both';partSelect.value=savedScope.part;axleSelect.value=savedScope.axle;sideSelect.value=savedScope.side;quantityInput.value=savedScope.quantity;manualScope=true;scopeDisplay();}lastKey=key();show(Object.assign({},saved,{variant:saved.part?saved.part.variant:saved.labour?saved.labour.variant:'',partsPence:saved.partsPence,chargedHoursMilli:saved.chargedHoursMilli}),saved.items);message.textContent=(saved.previewOnly?'SAVED TEST REPLAY — not a live supplier quote. ':'')+'Saved parts and labour breakdown. Refresh supplier prices before reusing an expired lookup.';}}
  [partSelect,axleSelect,sideSelect,quantityInput].forEach(function(control){control.addEventListener(control===partSelect||control===quantityInput?'input':'change',function(){invalidate();manualScope=true;if(control===partSelect){var parsed=scopes.scope(partSelect.value,axleSelect.value,sideSelect.value);if(parsed.quantity)quantityInput.value=parsed.quantity;}scopeDisplay();});});
  work.addEventListener('input',function(){invalidate();fromWork();});var reg=document.getElementById('job_registration');if(reg){reg.addEventListener('input',function(){additionalDrafts=[];invalidate();});reg.addEventListener('change',function(){additionalDrafts=[];invalidate();});}
  var automatic;

 }
 window.VectaRepairQuote={mount:mount};
})();
