(function(){
  const sheet=document.querySelector('.printSheet');
  let printing=false;
  function fit(){if(!printing)sheet.style.zoom=String(Math.min(1,(window.innerWidth-24)/794));}
  function beforePrint(){printing=true;sheet.style.removeProperty('zoom');}
  function afterPrint(){printing=false;fit();}
  fit();window.addEventListener('resize',fit);
  window.addEventListener('beforeprint',beforePrint);
  window.addEventListener('afterprint',afterPrint);
  const printMedia=window.matchMedia?.('print');
  printMedia?.addEventListener?.('change',event=>event.matches?beforePrint():afterPrint());
  const ready=Promise.resolve(window.VectaVehicleImage?.mount(document)).then(()=>window.VectaInvoicePrint?.cutout(document));
  async function outputInvoice(output){
    await ready;
    await Promise.all(Array.from(document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
      img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,5000);
    })));
    await window.VectaInvoicePrint.print(document,output);
  }
  ready.then(()=>window.VectaInvoicePrint?.fitFooter(document));
  document.getElementById('printInvoice').addEventListener('click',()=>outputInvoice('print'));
  document.getElementById('downloadInvoicePdf')?.addEventListener('click',()=>outputInvoice('pdf'));
})();
