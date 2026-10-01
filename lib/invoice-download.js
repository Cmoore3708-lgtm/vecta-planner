import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
export const sharePrefix='invoice_share:';
export function validShareToken(token){return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(String(token||''));}
export function validShare(value,now=Date.now()){return value&&/^[0-9a-f-]{36}$/.test(String(value.invoice_id||''))&&Number.isFinite(Date.parse(value.expires_at))&&Date.parse(value.expires_at)>now;}
export function downloadableInvoice(invoice){return invoice&&String(invoice.status||'').toLowerCase()==='saved'&&!invoice.archived&&!invoice.deleted_at&&Number.isFinite(Number(invoice.total));}
export async function invoicePdf(invoice,settings={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page,y;const ink=rgb(.10,.13,.17),red=rgb(.65,.05,.08),grey=rgb(.45,.48,.52);
 const clean=value=>String(value??'').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
 function text(value,x,at,size=10,face=font,color=ink){page.drawText(clean(value),{x,y:at,size,font:face,color});}
 function right(value,x,at,size=10,face=font){value=clean(value);text(value,x-face.widthOfTextAtSize(value,size),at,size,face);}
 function newPage(){page=pdf.addPage([595.28,841.89]);y=790;text('VECTA',40,y,27,bold,red);right('INVOICE',555,y,20,bold);y-=25;text(settings.businessName||'Vecta Motors',40,y,11,bold);right(invoice.invoice_number||'',555,y,12,bold);y-=20;text('Contractors Compound - Nissan Motor Manufacturing',40,y);y-=15;text('Nissan Way, Washington, SR5 3NS',40,y);y-=15;text('Tel: 07721 722622   VAT No: '+(settings.vatNumber||'169170002'),40,y);y-=32;}
 function wrap(value,width){const words=clean(value).replace(/\n/g,' \n ').split(' '),rows=[];let line='';for(let word of words){if(word==='\n'){rows.push(line);line='';continue;}while(font.widthOfTextAtSize(word,10)>width){let n=1;while(n<word.length&&font.widthOfTextAtSize(word.slice(0,n+1),10)<=width)n++;if(line){rows.push(line);line='';}rows.push(word.slice(0,n));word=word.slice(n);}const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,10)>width){rows.push(line);line=word;}else line=next;}if(line||!rows.length)rows.push(line);return rows;}
 newPage();text('CUSTOMER',40,y,9,bold,grey);right('Date: '+String(invoice.invoice_date||'').slice(0,10),555,y);y-=17;text(invoice.customer_name||'Customer',40,y,12,bold);y-=18;
 const address=invoice.customer_address||invoice.lines?.[0]?.customer_address||'';for(const row of wrap(address,510)){if(row){text(row,40,y);y-=14;}}
 text('Registration: '+(invoice.registration||''),40,y,11,bold);y-=18;text('Vehicle: '+(invoice.vehicle||''),40,y);y-=30;
 function headings(){page.drawRectangle({x:40,y:y-6,width:515,height:22,color:ink});text('Work / item',48,y+1,10,bold,rgb(1,1,1));text('Price',385,y+1,10,bold,rgb(1,1,1));text('VAT basis',465,y+1,10,bold,rgb(1,1,1));y-=27;}
 headings();
 for(const line of invoice.lines||[]){const rows=wrap(line.description||'Workshop work',320);let first=true;for(const row of rows){if(y<130){newPage();headings();}text(row,48,y);if(first){right('£'+Number(line.amount||0).toFixed(2),450,y);text(line.vat_mode==='ex_vat'?'Ex VAT':line.vat_mode==='inc_vat'?'Inc VAT':'No VAT',465,y);first=false;}y-=15;}page.drawLine({start:{x:40,y:y-3},end:{x:555,y:y-3},thickness:.5,color:rgb(.85,.86,.88)});y-=15;}
 if(y<225)newPage();y-=10;
 for(const [label,value] of [['Subtotal',invoice.subtotal],['VAT',invoice.vat],['Total',invoice.total]]){text(label,385,y,label==='Total'?13:11,label==='Total'?bold:font);right('£'+Number(value||0).toFixed(2),555,y,label==='Total'?15:11,label==='Total'?bold:font);y-=23;}
 y-=15;text('PAYMENT DETAILS',40,y,9,bold,grey);y-=18;
 for(const row of ['Bank: '+(settings.bankName||''),'Account name: '+(settings.accountName||'Vecta Motors'),'Account number: '+(settings.accountNumber||''),'Sort code: '+(settings.sortCode||''),'Reference: '+(invoice.registration||invoice.invoice_number||'')]){text(row,40,y);y-=15;}
 const pages=pdf.getPages();for(let i=0;i<pages.length;i++){pages[i].drawText('VectaMotors.co.uk',{x:40,y:35,size:9,font,color:grey});pages[i].drawText(`Page ${i+1} of ${pages.length}`,{x:490,y:35,size:9,font,color:grey});}
 pdf.setTitle('Invoice '+(invoice.invoice_number||''));return Buffer.from(await pdf.save());
}
