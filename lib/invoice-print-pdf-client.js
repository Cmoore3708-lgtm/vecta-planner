import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';

async function create(element) {
  await Promise.all(Array.from(element.querySelectorAll('img')).map(async img=>{
    if(!img.complete&&img.decode)await img.decode();
    if(!img.naturalWidth||!img.naturalHeight)return;
    const imageCanvas=element.ownerDocument.createElement('canvas');imageCanvas.width=img.naturalWidth;imageCanvas.height=img.naturalHeight;
    try{imageCanvas.getContext('2d').drawImage(img,0,0);img.src=imageCanvas.toDataURL('image/png');if(img.decode)await img.decode();}finally{imageCanvas.width=0;imageCanvas.height=0;}
  }));
  const canvas = await html2canvas(element, {scale:2,backgroundColor:'#ffffff',logging:false,useCORS:true,windowWidth:794,scrollX:0,scrollY:0});
  const pdf = await PDFDocument.create();
  pdf.setTitle('VECTA Invoice');pdf.setAuthor('Vecta Motors');
  const pageWidth=595.28,pageHeight=841.89,margin=28.346,contentWidth=pageWidth-margin*2;
  const pointsPerPixel=contentWidth/canvas.width,capacity=(pageHeight-margin*2)/pointsPerPixel;
  const top=element.getBoundingClientRect().top,ratio=canvas.width/element.getBoundingClientRect().width;
  const protectedBlocks=Array.from(element.querySelectorAll('tr,.invoiceBottomBlock,.invoicePrintHeader')).map(node=>{const r=node.getBoundingClientRect();return {top:(r.top-top)*ratio,bottom:(r.bottom-top)*ratio};});
  let start=0;
  while(start<canvas.height){
    let end=Math.min(canvas.height,Math.floor(start+capacity));
    if(end<canvas.height)for(const block of protectedBlocks){if(block.top>start+1&&block.top<end&&block.bottom>end&&block.bottom-block.top<=capacity)end=Math.floor(block.top);}
    if(end<=start)end=Math.min(canvas.height,Math.floor(start+capacity));
    const slice=element.ownerDocument.createElement('canvas');slice.width=canvas.width;slice.height=end-start;
    slice.getContext('2d').drawImage(canvas,0,start,canvas.width,end-start,0,0,canvas.width,end-start);
    const image=await pdf.embedPng(slice.toDataURL('image/png'));
    const page=pdf.addPage([pageWidth,pageHeight]),height=(end-start)*pointsPerPixel;
    page.drawImage(image,{x:margin,y:pageHeight-margin-height,width:contentWidth,height});
    slice.width=0;slice.height=0;start=end;
  }
  canvas.width=0;canvas.height=0;
  return pdf.save();
}
async function save(element) {
  const bytes=await create(element),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const number=element.querySelector('.printTitle>span')?.textContent?.trim()||'Invoice';
  const link=document.createElement('a');link.href=url;link.download=('Invoice-'+number+'.pdf').replace(/[^a-zA-Z0-9_.-]/g,'-');
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),600000);
}
globalThis.VectaInvoicePdf={create,save};
