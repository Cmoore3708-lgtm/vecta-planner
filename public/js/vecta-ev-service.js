function isBatteryElectricService(job){
  const fuel=String(job?.fuel_type||job?.fuelType||'').trim();
  if(fuel)return /^(electric(?:ity)?|pure electric|battery electric(?: vehicle)?|bev|ev)$/i.test(fuel);
  return /\b(?:EV|electric vehicle|battery electric)\s+servic(?:e|ing)\b/i.test([job?.job_type,job?.service_type,job?.work_required].join(' '));
}
function updateServiceBattery(input){
  input.setAttribute('value',input.value);
  const battery=input.closest('.ssCharge');
  battery.querySelector('i').style.width=input.value+'%';
  battery.querySelector('output').textContent=input.value+'%';
}
function applyElectricServiceSheet(sheet,job){
  if(!sheet||sheet.dataset.sheetType!=='service'||!(sheet.dataset.electricService||isBatteryElectricService(job)))return;
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
    cell.previousElementSibling.textContent='Battery charge (at start)';
    cell.innerHTML='<div class="ssCharge"><div class="ssBattery"><i></i><input type="range" aria-label="Battery charge at start (%)" min="0" max="100" value="0" oninput="updateServiceBattery(this)" onclick="updateServiceBattery(this)"></div><output>Unrecorded</output></div>';
  }
  const fluids=sheet.querySelector('.ssFluidsHorizontal');
  if(fluids){
    const title=fluids.closest('.ssSection').querySelector('.ssTitle');
    if(title)for(const node of title.childNodes)if(node.nodeType===3&&node.textContent.trim())node.textContent=' Fluids';
    for(const cell of fluids.querySelectorAll('.ssFluidInline')){
      if(/oil|quantity|coolant/i.test(cell.querySelector('b')?.textContent||''))cell.remove();
    }
  }
  for(const row of sheet.querySelectorAll('.ssOps tr,.ssHealthChecks tr')){
    const label=row.querySelector('td:first-child')?.textContent.trim()||'';
    if(/^(?:interim service$|(?:engine )?oil\b|air filter\b|fuel filter\b|spark plugs?\b|coolant\b|power steering\b|exhaust system\b|drive belts?\b)/i.test(label))row.remove();
  }
  const ops=sheet.querySelector('.ssOps');
  if(ops&&!sheet.querySelector('.ssDiagnostic')){
    ops.insertAdjacentHTML('afterend','<div class="ssDiagnostic"><label><b>Diagnostic scan complete?</b> <button type="button" class="ssTickBox" role="checkbox" aria-checked="false" aria-label="Diagnostic scan complete" onclick="toggleServiceCheck(this)"></button></label><b>Scan results</b><div class="ssScanNotes editable" role="textbox" aria-label="Diagnostic scan results" aria-multiline="true" contenteditable="true"></div></div>');
  }
}
