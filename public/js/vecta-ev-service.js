function isBatteryElectricService(job){
  const reg=String(job?.registration||'').replace(/\s/g,'').toUpperCase();
  const vehicle=reg&&typeof app!=='undefined'&&(app.vehicles||[]).find(v=>String(v.registration||'').replace(/\s/g,'').toUpperCase()===reg);
  const fuel=[job?.fuel_type,job?.fuelType,vehicle?.fuel_type,vehicle?.fuelType].map(v=>String(v||'').trim()).find(v=>v&&!/^(?:unknown|n\/a|other)$/i.test(v));
  if(fuel)return /^(electric(?:ity)?|pure electric|fully electric|battery[- ]electric(?: vehicle)?|electric vehicle|bev|ev)$/i.test(fuel);
  return /\b(?:EV|electric vehicle|battery electric)\s+servic(?:e|ing)\b/i.test([job?.job_type,job?.service_type,job?.work_required].join(' '));
}
function updateServiceBattery(input){
  input.setAttribute('value',input.value);
  const battery=input.closest('.ssCharge');
  battery.querySelector('i').style.width=input.value+'%';
  battery.querySelector('output').textContent=input.value+'%';
}
function applyElectricServiceSheet(sheet,job){
  if(!sheet||sheet.dataset.sheetType!=='service'||!(sheet.dataset.sheetChoice==='ev'||(sheet.dataset.sheetChoice!=='standard'&&(sheet.dataset.electricService||isBatteryElectricService(job)))))return;
  sheet.dataset.electricService='true';
  if(!sheet.querySelector('style[data-ev-layout]'))sheet.insertAdjacentHTML('afterbegin',`<style data-ev-layout>
.servicePrint .ssCharge{display:grid;gap:3px;justify-items:center;padding:4px;font-weight:bold}
.servicePrint .ssBattery{position:relative;width:80%;height:18px;border:2px solid #253b40;border-radius:4px;background:#fff}
.servicePrint .ssBattery:after{content:'';position:absolute;left:100%;top:4px;width:5px;height:7px;background:#253b40}
.servicePrint .ssBattery i{display:block;width:0;height:100%;background:#33a875;print-color-adjust:exact}
.servicePrint .ssBattery input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.servicePrint .ssBattery:focus-within{outline:2px solid #0875bc;outline-offset:2px}
.servicePrint .ssDiagnostic{padding:4px;display:grid;gap:3px}
.servicePrint .ssDiagnostic label{display:flex;align-items:center;gap:5px}
.servicePrint .ssDiagnostic button{padding:0}
.servicePrint .ssScanNotes{min-height:2.4em;border:1px solid #9da5aa;padding:3px;white-space:pre-wrap;overflow-wrap:anywhere}
</style>`);
  sheet.querySelector('.ssDocumentTitle').textContent='EV Service Sheet';
  const oil=sheet.querySelector('.dipWrap');
  if(oil){
    const cell=oil.closest('.ssPreBody');
    cell.dataset.standardGauge=cell.innerHTML;
    cell.previousElementSibling.textContent='Battery charge (at start)';
    cell.innerHTML='<div class="ssCharge"><div class="ssBattery"><i></i><input type="range" aria-label="Battery charge at start (%)" min="0" max="100" value="0" oninput="updateServiceBattery(this)" onclick="updateServiceBattery(this)"></div><output>Unrecorded</output></div>';
  }
  const fluids=sheet.querySelector('.ssFluidsHorizontal');
  if(fluids){
    const title=fluids.closest('.ssSection').querySelector('.ssTitle');
    if(title)for(const node of title.childNodes)if(node.nodeType===3&&node.textContent.trim())node.textContent=' Fluids';
    for(const cell of fluids.querySelectorAll('.ssFluidInline')){
      if(/oil|quantity|coolant/i.test(cell.querySelector('b')?.textContent||''))parkStandardItem(cell);
    }
  }
  for(const row of sheet.querySelectorAll('.ssOps tr,.ssHealthChecks tr')){
    const label=row.querySelector('td:first-child')?.textContent.trim()||'';
    if(/^(?:interim service$|(?:engine )?oil\b|air filter\b|fuel filter\b|spark plugs?\b|coolant\b|power steering\b|exhaust system\b|drive belts?\b)/i.test(label))parkStandardItem(row);
  }
  const ops=sheet.querySelector('.ssOps');
  if(ops&&!sheet.querySelector('.ssDiagnostic')){
    ops.insertAdjacentHTML('afterend','<div class="ssDiagnostic"><label><b>Diagnostic scan complete?</b> <button type="button" class="ssTickBox" role="checkbox" aria-checked="false" aria-label="Diagnostic scan complete" onclick="toggleServiceCheck(this)"></button></label><b>Scan results</b><div class="ssScanNotes editable" role="textbox" aria-label="Diagnostic scan results" aria-multiline="true" contenteditable="true"></div></div>');
  }
}

function parkStandardItem(item){
  const marker=item.ownerDocument.createElement('template');
  marker.dataset.standardItem=item.outerHTML;
  item.replaceWith(marker);
}
function sizeServicePaper(){
  const paper=document.getElementById('printSheet');
  if(paper)paper.style.setProperty('--service-paper-scale',String(Math.min(1,document.documentElement.clientWidth/(210*96/25.4))));
}
function mountServiceSheetSelector(controls,sheet,job){
  if(sheet){
    sizeServicePaper();
    window.addEventListener('resize',sizeServicePaper);
  }
  if(!sheet||sheet.dataset.sheetType!=='service')return;
  const doc=sheet.ownerDocument,select=doc.createElement('select');
  select.setAttribute('aria-label','Service sheet type');
  const detected=job?.fuel_type||job?.fuelType||job?.registration?isBatteryElectricService(job):!!sheet.dataset.electricService;
  for(const [value,label] of [['auto','Auto · '+(detected?'EV':'Standard')],['ev','EV sheet'],['standard','Standard sheet']]){
    const option=doc.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
  }
  select.value=sheet.dataset.sheetChoice||'auto';
  const label=doc.createElement('label');label.textContent='Service sheet ';label.appendChild(select);controls.prepend(label);
  select.onchange=()=>{
    // A disconnected sheet also cancels any in-flight Haynes rendering.
    const next=sheet.cloneNode(true);sheet.replaceWith(next);sheet=next;
    switchServiceSheet(sheet,job,select.value);
    sheet.querySelectorAll('[data-optional-tool]').forEach(node=>node.remove());
    updateServiceHealthScore();watchServiceSheetDraft();persistServiceSheetDraft();
    if(window.initHaynesServiceSheet)window.initHaynesServiceSheet(sheet,activeServiceRegistration,activeServiceKind);
  };
}
function switchServiceSheet(sheet,job,choice){
  const electric=choice==='ev'||(choice==='auto'&&isBatteryElectricService(job));
  sheet.dataset.sheetChoice=choice;
  if(electric){
    applyElectricServiceSheet(sheet,job);
    for(const [selector,key] of [['.ssCharge','savedCharge'],['.ssDiagnostic','savedScan']]){
      const current=sheet.querySelector(selector);
      if(current&&sheet.dataset[key]){current.outerHTML=sheet.dataset[key];delete sheet.dataset[key];}
    }
    return;
  }
  delete sheet.dataset.electricService;
  const charge=sheet.querySelector('.ssCharge'),diagnostic=sheet.querySelector('.ssDiagnostic');
  if(charge){
    sheet.dataset.savedCharge=charge.outerHTML;
    const cell=charge.closest('.ssPreBody');cell.previousElementSibling.textContent='Oil level (at start)';
    cell.innerHTML=cell.dataset.standardGauge||'';delete cell.dataset.standardGauge;
  }
  if(diagnostic){sheet.dataset.savedScan=diagnostic.outerHTML;diagnostic.remove();}
  for(const marker of sheet.querySelectorAll('template[data-standard-item]'))marker.outerHTML=marker.dataset.standardItem;
  sheet.querySelector('.ssDocumentTitle').textContent='Service Sheet';
  const title=sheet.querySelector('.ssFluidsHorizontal')?.closest('.ssSection')?.querySelector('.ssTitle');
  if(title)for(const node of title.childNodes)if(node.nodeType===3&&node.textContent.trim())node.textContent=' Oil & Fluids';
}

