import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const printSource=fs.readFileSync(new URL('../../public/js/vecta-invoice-print.js',import.meta.url),'utf8');
const root={};vm.runInNewContext(printSource,{globalThis:root});
const title=root.VectaInvoicePrint.documentTitle;
const tax={invoice_number:'VECTA-78805',registration:'NMUK TAX',customer_name:'NMUK',vehicle:'Vehicle tax October 2026',invoice_date:'2026-11-04'};
test('NMUK tax example and regular monthly invoice use number, account and billing month',()=>{
 assert.equal(title(tax),'VECTA Invoice 78805 NMUK October 26');
 assert.equal(title({invoice_number:'VECTA-78801',fleet_customer:'NMUK',fleet_month:'2026-10',invoice_date:'2026-11-04'}),'VECTA Invoice 78801 NMUK October 26');
});
test('contractor invoice month wins over creation date and customer names retain spaces',()=>{
 assert.equal(title({invoice_number:'VECTA-78806',fleet_customer:'E4 ELECTRICAL',fleet_month:'2026-10',invoice_date:'2026-11-04'}),'VECTA Invoice 78806 E4 ELECTRICAL October 26');
 assert.equal(title({invoice_number:'78807',customer_name:'WPC',invoice_date:'2028-02-29',lines:[{invoice_customer_account:'CONTRACTOR'}]}),'VECTA Invoice 78807 WPC February 28');
});
test('filenames remove unsafe path/header characters and leave Staff behaviour unchanged',()=>{
 assert.equal(title({invoice_number:'VECTA-78808',fleet_customer:'WPC / North\r\n"',fleet_month:'2026-12'}),'VECTA Invoice 78808 WPC North December 26');
 assert.equal(title({invoice_number:'VECTA-78809',customer_account:'STAFF',invoice_date:'2026-10-31'}),'');
 assert.equal(title({invoice_number:'VECTA-78809',customer_name:'Jane Smith',invoice_date:'2026-10-31'}),'');
});
test('shared printed markup carries the filename for workshop and customer PDF buttons',()=>{
 const markup=root.VectaInvoicePrint.render({inv:tax,isFleet:true,rows:'',customer:'',mileage:'',motDue:'',senderHtml:'',accountHeading:'',plateHtml:'',settings:{}});
 assert.match(markup,/data-invoice-document-title="VECTA Invoice 78805 NMUK October 26"/);
});
test('PDF download and PDF metadata use the exact filename with spaces',async()=>{
 let metadata,download;
 const pdf={setTitle:value=>{metadata=value},setAuthor(){},save:async()=>new Uint8Array([1])};
 const source=fs.readFileSync(new URL('../../lib/invoice-print-pdf-client.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const c={html2canvas:async()=>({width:794,height:0}),PDFDocument:{create:async()=>pdf},
  URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,setTimeout(){},
  document:{createElement:()=>({click(){download=this.download},remove(){}}),body:{appendChild(){}}}};
 vm.createContext(c);vm.runInContext(source,c);
 const element={dataset:{invoiceDocumentTitle:title(tax)},querySelector:()=>({textContent:'VECTA-78805'}),querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0,width:794})};
 await c.VectaInvoicePdf.save(element);
 assert.equal(metadata,'VECTA Invoice 78805 NMUK October 26');
 assert.equal(download,'VECTA Invoice 78805 NMUK October 26.pdf');
});
test('server PDF download and customer HTML title use the same shared formatter',()=>{
 const server=fs.readFileSync(new URL('../../api/_invoice-pdf.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../../api/_invoice-html.js',import.meta.url),'utf8');
 assert.match(server,/pdf\.setTitle\(globalThis\.VectaInvoicePrint\.documentTitle\(invoice,job\)/);
 assert.match(server,/const filename = documentTitle\?documentTitle\+'\.pdf'/);
 assert.match(html,/esc\(globalThis\.VectaInvoicePrint\.documentTitle\(inv,job\)/);
});
