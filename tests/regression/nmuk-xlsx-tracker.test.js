import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../../public/js/vecta-monthly-tracker.js',import.meta.url),'utf8');
function exporter(){const c={window:{},TextEncoder,Uint8Array,DataView};vm.createContext(c);vm.runInContext(source,c);return c.window.VectaMonthlyTracker}
test('Excel workbook has valid ZIP/XML, text dates, wide wrapped columns and numeric amounts',()=>{
 const result=exporter().build('2026-10',[
 ['01/10','AB12 CDE','Internal','Service; brakes, front',190],
 ['09/10; 14/10','CD34 FGH','Other','=SUM(A1:A2) & test',25]
 ],[{description:'Monthly maintenance',amount:450,section:'other'}],{total:665,internal:190,other:475});
 assert.equal(result.filename,'Vecta Monthly Tracker October 26.xlsx');
 const run=spawnSync('python',['-c',`import sys,zipfile,io,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None
for name in z.namelist(): E.fromstring(z.read(name))
s=E.fromstring(z.read('xl/worksheets/sheet1.xml')); n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
cells={c.attrib['r']:c for c in s.findall('.//s:c',n)}
assert cells['A3'].attrib['t']=='inlineStr'
assert cells['A3'].find('s:is/s:t',n).text=='01/10'
assert cells['A4'].find('s:is/s:t',n).text=='09/10; 14/10'
assert cells['D4'].find('s:is/s:t',n).text=='=SUM(A1:A2) & test'
assert cells['A6'].find('s:is/s:t',n).text=='31/10'
assert cells['D6'].find('s:is/s:t',n).text=='Monthly maintenance'
assert cells['E6'].find('s:v',n).text=='450.00'
assert not s.findall('.//s:f',n)
assert s.find('s:cols',n)[3].attrib['width']=='90'
`],{input:result.bytes});
 assert.equal(run.status,0,run.stderr.toString());
 assert.match(result.files['xl/styles.xml'],/wrapText="1"/);
 assert.doesNotMatch(result.files['xl/worksheets/sheet1.xml'],/Editable monthly charges/);
});
test('each monthly charge uses the calendar month end including leap years',()=>{
 for(const [month,end] of [['2026-10','31/10'],['2027-02','28/02'],['2028-02','29/02']]){
  const result=exporter().build(month,[],[{description:'Charge',amount:10,section:'other'}],{total:10,internal:0,other:10});
  assert.ok(result.files['xl/worksheets/sheet1.xml'].includes('>'+end+'</t>'));
 }
});
test('tracker includes saved monthly edits even when issued invoice has no extras; invoice remains frozen',()=>{
 let output;
 const invoice={fleet_customer:'NMUK',fleet_month:'2026-10',lines:[{amount:100,nmuk_monthly_extras:[]}],fleet_job_snapshot:{rows:[{amount:100,job:{}}],invoice_lines:[{amount:100,nmuk_monthly_extras:[]}],subtotal:100}};
 const original=JSON.stringify(invoice);
 const c={window:{VectaMonthlyTracker:{download:(...args)=>output=args}},app:{settings:{nmukPreviewDrafts:{'2026-10':[{description:'Saved charge',amount:450,section:'other'}]}}},fleetNmukMonthlyDrafts:{},vectaActiveInvoices:()=>[invoice],fleetEomCustomerTotal:()=>100,invoiceTotals:()=>({subtotal:100}),fleetNmukIsInternalJob:()=>false,fleetNmukMonthlyLines:()=>c.app.settings.nmukPreviewDrafts['2026-10'],fleetNmukCsvVehicleRows:()=>[['01/10','AB12 CDE','Other','Work',100]],alert:message=>assert.fail(message)};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function fleetNmukEomExportReport('),html.indexOf('function fleetNmukCsvTypeForJob(')),c);
 vm.runInContext(html.slice(html.indexOf('function fleetDownloadNmukWorkbook('),html.indexOf('function fleetDownloadEomCsv(')),c);
 c.fleetDownloadNmukWorkbook('2026-10',[]);
 assert.equal(output[2][0].description,'Saved charge');assert.equal(output[3].total,550);assert.equal(output[3].other,550);
 assert.equal(JSON.stringify(invoice),original);
});
