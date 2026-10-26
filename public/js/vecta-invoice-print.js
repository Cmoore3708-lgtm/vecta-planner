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

    const brand=manufacturer(inv.make||inv.vehicle);
    const badge=brand?'<img class="invoiceMakeBadge" src="/assets/manufacturers/'+brand+'.svg" alt="'+esc(brand)+' logo">':'';
    const sender=isFleet?senderHtml:senderHtml.replace(/^(<img\b[^>]*>)([\s\S]*)$/, '<div class="invoiceLogoAnchor">$1</div><div class="invoiceSenderContacts">$2</div>');
    const hasMileage=mileage!==''&&mileage!=null&&Number.isFinite(Number(String(mileage).replace(/,/g,'')))&&Number(String(mileage).replace(/,/g,''))>=0;
    const vehicleHeader=isFleet?'':'<div class="invoiceBookingHeader"><div class="invoiceBookingDetails"><div class="invoiceBookingPlate">'+plateHtml+'</div><div class="invoiceVehicleIdentityRow"><strong class="invoiceVehicleMake">'+esc(inv.vehicle||'Vehicle')+'</strong>'+(hasMileage?'<span class="invoiceVehicleMileage">'+esc(mileage)+' miles</span>':'')+badge+'</div></div><div class="invoiceBookingArtwork"></div></div>';
    return '<div class="invoicePrintPage"><div class="invoicePrintHeader'+(isFleet?' invoiceFleetHeader':'')+'"><div class="invoiceSender">'+sender+'</div>'+vehicleHeader+'<div class="printTitle">INVOICE'+accountHeading+'<br><span>'+esc(inv.invoice_number||'')+'</span><br><small>'+esc(formatDate(inv.invoice_date))+'</small>'+customer+'</div></div>'+'<table class="printTable invoiceWorkPrint"><tr><th>Work</th><th>'+(staffInvoice?'Amount (ex VAT)':'Amount')+'</th><th>VAT</th></tr>'+rows+'</table><div class="invoiceBottomBlock noBreak"><div class="printTotals noBreak printTotalsGrid"><div><b>Subtotal:</b><span>'+money(inv.subtotal||0)+'</span></div><div><b>VAT:</b><span>'+money(inv.vat||0)+'</span></div><div><b>Total:</b><span>'+money(inv.total||0)+'</span></div></div><div class="printPayment noBreak"><div><span><b>Bank:</b> '+esc(settings.bankName||'')+'</span> <span><b>Account Name:</b> '+esc(settings.accountName||'Vecta Motors')+'</span> <span><b>Account Number:</b> '+esc(settings.accountNumber||'')+'</span> <span><b>Sort Code:</b> '+esc(settings.sortCode||'')+'</span> <span><b>Reference:</b> '+esc(inv.registration||'Registration number')+'</span></div></div></div></div>';
  }
  async function cutout(scope){
    const doc=root.document,NS='http://www.w3.org/2000/svg';
    await Promise.all(Array.from(scope.querySelectorAll('.haynesInvoiceImage')).map(async img=>{
      if(img.dataset.invoiceCutout==='1')return;
      const source=img.getAttribute('src')||'';
      if(!source.startsWith('data:image/svg+xml'))return;
      let host;
      try{
        const svg=new root.DOMParser().parseFromString(decodeURIComponent(source.slice(source.indexOf(',')+1)),'image/svg+xml').documentElement;
        if(svg.namespaceURI!==NS||svg.localName!=='svg')return;
        svg.querySelectorAll('[id="background"], [id="gradients_background"], [id="shadow"]').forEach(node=>node.remove());
        host=doc.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';host.appendChild(svg);doc.body.appendChild(host);
        const box=svg.getBBox();
        if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)return;
        svg.setAttribute('viewBox',[box.x,box.y,box.width,box.height].join(' '));
        svg.setAttribute('width',box.width);svg.setAttribute('height',box.height);svg.setAttribute('preserveAspectRatio','xMaxYMax meet');
        img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new root.XMLSerializer().serializeToString(svg));
        if(img.decode)await img.decode();img.dataset.invoiceCutout='1';
      }catch{/* Keep the original artwork if its drawing cannot be measured. */}
      finally{host?.remove();}
    }));
  }
  let exporterReady;
  async function exporter(){
    if(root.VectaInvoicePdf)return root.VectaInvoicePdf;
    if(!exporterReady)exporterReady=new Promise((resolve,reject)=>{
      const script=root.document.createElement('script');script.src='/js/vecta-invoice-pdf-client.js?v=20261022-clean-pdf';
      script.onload=()=>resolve(root.VectaInvoicePdf);script.onerror=()=>{exporterReady=null;script.remove();reject(Error('Invoice PDF could not load'));};root.document.head.appendChild(script);
    });
    return exporterReady;
  }
  async function print(sheet,output){
    await cutout(sheet);
    const doc=root.document,frame=doc.createElement('iframe');
    frame.title='VECTA invoice print';frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
    const markup=sheet.querySelector('.invoicePrintPage').outerHTML;
    const loaded=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('Invoice print document could not load'));});
    frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><base href="'+root.location.origin+'/"><title>VECTA Invoice</title><link rel="stylesheet" href="/js/vecta-customer-invoice.css?v=20261026-compact-bank-footer"></head><body><main class="printSheet">'+markup+'</main></body></html>';
    doc.body.appendChild(frame);
    try{
      await loaded;
      const win=frame.contentWindow;
      await Promise.all(Array.from(win.document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});root.setTimeout(resolve,5000);} )));
      if(win.document.fonts?.ready)await win.document.fonts.ready;
      await new Promise(resolve=>win.requestAnimationFrame(()=>win.requestAnimationFrame(resolve)));
      fitFooter(win.document);
      if(output==='print'){
        win.addEventListener('afterprint',()=>frame.remove(),{once:true});
        win.focus();win.print();root.setTimeout(()=>frame.remove(),60000);
      }else{
        await (await exporter()).save(win.document.querySelector('.invoicePrintPage'));
        frame.remove();
      }
    }catch(error){frame.remove();throw error;}
  }
  function fitFooter(scope){
    const line=scope.querySelector('.printPayment>div');
    if(line?.style)line.style.fontSize='10px';
    const page=scope.querySelector('.invoicePrintPage');
    page?.style?.setProperty('--invoice-work-description-size','14px');
    const badge=scope.querySelector('.invoiceMakeBadge'),label=scope.querySelector('.printCustomerTop>b'),row=scope.querySelector('.invoiceVehicleIdentityRow');
    if(badge&&label&&row&&row.offsetHeight){
      const scale=row.getBoundingClientRect().height/row.offsetHeight;
      if(scale>0){const bottom=parseFloat(badge.ownerDocument.defaultView.getComputedStyle(badge).bottom)||0;badge.style.bottom=(bottom+(badge.getBoundingClientRect().bottom-label.getBoundingClientRect().bottom)/scale)+'px';}
    }
  }
  function formatDate(value){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return match?match[3]+'/'+match[2]+'/'+match[1]:String(value||'');}
  root.VectaInvoicePrint={render,manufacturer,print,cutout,formatDate,fitFooter};
})(globalThis);
