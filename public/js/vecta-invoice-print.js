// One invoice print template, shared by workshop printing and customer links.
(function(root){
  function manufacturer(value){
    const brands=['mercedes-benz','land-rover','volkswagen','mitsubishi','vauxhall','infiniti','hyundai','renault','peugeot','citroen','porsche','nissan','toyota','suzuki','jaguar','lexus','mazda','honda','skoda','volvo','tesla','dacia','audi','ford','seat','fiat','mini','bmw','kia','mg'];
    const name=String(value||'').toLowerCase().replace(/[-_]/g,' ');
    return brands.find(b=>name===b.replace(/-/g,' ')||name.startsWith(b.replace(/-/g,' ')+' '));
  }
  function render(o){
    const {inv,staffInvoice,isFleet,rows,customer,mileage,motDue,senderHtml,accountHeading,plateHtml,settings}=o;
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=value=>'£'+Number(value||0).toFixed(2);
    const niceDate=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    const brand=manufacturer(inv.make||inv.vehicle);
    const badge=brand?'<img class="invoiceMakeBadge" src="/assets/manufacturers/'+brand+'.svg" alt="'+esc(brand)+' logo">':'';
    const vehicleHeader=isFleet?'':'<div class="invoiceBookingHeader"><div class="invoiceBookingDetails"><strong>'+esc(inv.vehicle||'Vehicle')+'</strong><div class="invoiceBookingPlate">'+plateHtml+badge+'</div><small>'+esc(mileage!==''&&mileage!=null?String(mileage)+' miles':'Mileage not recorded')+' · MOT due '+esc(motDue?niceDate(String(motDue).slice(0,10)):'not recorded')+'</small></div><div class="invoiceBookingArtwork"></div></div>';
    return '<div class="invoicePrintPage"><div class="invoicePrintHeader'+(isFleet?' invoiceFleetHeader':'')+'"><div class="invoiceSender">'+senderHtml+'</div>'+vehicleHeader+'<div class="printTitle">INVOICE'+accountHeading+'<br><span>'+esc(inv.invoice_number||'')+'</span><br><small>'+esc(inv.invoice_date||'')+'</small>'+customer+'</div></div>'+'<table class="printTable invoiceWorkPrint"><tr><th>Work</th><th>'+(staffInvoice?'Amount (ex VAT)':'Amount')+'</th><th>VAT</th></tr>'+rows+'</table><div class="printTotals noBreak printTotalsGrid"><div><b>Subtotal:</b><span>'+money(inv.subtotal||0)+'</span></div><div><b>VAT:</b><span>'+money(inv.vat||0)+'</span></div><div><b>Total:</b><span>'+money(inv.total||0)+'</span></div></div><div class="printPayment noBreak"><div><b>Bank:</b> '+esc(settings.bankName||'')+' &nbsp; <b>Account Name:</b> '+esc(settings.accountName||'Vecta Motors')+' &nbsp; <b>Account Number:</b> '+esc(settings.accountNumber||'')+' &nbsp; <b>Sort Code:</b> '+esc(settings.sortCode||'')+' &nbsp; <b>Reference:</b> '+esc(inv.registration||'Registration number')+'</div></div></div>';
  }
  async function print(sheet){
    const doc=root.document,frame=doc.createElement('iframe');
    frame.title='VECTA invoice print';frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
    const markup=sheet.querySelector('.invoicePrintPage').outerHTML;
    const loaded=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('Invoice print document could not load'));});
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><base href="'+root.location.origin+'/"><title>VECTA Invoice</title><link rel="stylesheet" href="/js/vecta-customer-invoice.css?v=20261022-invoice-top-row"></head><body><main class="printSheet">'+markup+'</main></body></html>';
    doc.body.appendChild(frame);
    try{
      await loaded;
      const win=frame.contentWindow;
      await Promise.all(Array.from(win.document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});root.setTimeout(resolve,5000);} )));
      if(win.document.fonts?.ready)await win.document.fonts.ready;
      await new Promise(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(resolve)));
      win.addEventListener('afterprint',()=>root.setTimeout(()=>frame.remove(),0),{once:true});
      root.setTimeout(()=>frame.remove(),600000);
      win.focus();win.print();
    }catch(error){frame.remove();throw error;}
  }
  root.VectaInvoicePrint={render,manufacturer,print};
})(globalThis);
