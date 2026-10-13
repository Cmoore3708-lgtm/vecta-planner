(function(){
  const sheet = document.querySelector('.printSheet');
  function fit(){sheet.style.zoom=String(Math.min(1,(window.innerWidth-24)/794));}
  fit();window.addEventListener('resize',fit);
  const ready = window.VectaVehicleImage?.mount(document) || Promise.resolve();
  document.getElementById('printInvoice').addEventListener('click', async () => {
    await ready;
    await Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,5000);
    })));
    window.print();
  });
})();
