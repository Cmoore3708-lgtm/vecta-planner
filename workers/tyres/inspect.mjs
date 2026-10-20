import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SUPPLIER } from './browser.mjs';
import { inspectDocument } from './inspect-dom.mjs';
import { readEspGrid } from './esp-dom.mjs';
import { inspectEspStructure } from './esp-structure.mjs';
import { testEspSearch } from './esp-search.mjs';
import { readEspSettings } from './esp-settings.mjs';
const profile = process.env.TYRE_PROFILE_DIR || resolve(process.env.LOCALAPPDATA || '.', 'VectaTyres', 'EdgeProfile');
const context = await chromium.launchPersistentContext(profile, { channel:'msedge',headless:false,acceptDownloads:false });
const terminal = createInterface({input:stdin,output:stdout});
try {
 const page=context.pages()[0] || await context.newPage();await page.goto(SUPPLIER,{timeout:30000});
 console.log('\nSign in directly in Edge, then click the Enquiry image/tab to the right of the car, and search for 205/55 R16. Do not place an order.');
 await terminal.question('Once the results appear, return here and press Enter: ');
 if(new URL(page.url()).origin!==new URL(SUPPLIER).origin || /\/Account\/LogOn/i.test(page.url()))throw Error('The supplier results page is not open.');
 // Inject the allowlisted reader, not a full-page capture.
 const report=await page.evaluate(source=>{const reader=new Function('return ('+source+')')();return reader(document);},inspectDocument.toString());
 if(!report.tables.length)throw Error('The ESP tyre-results grid is not open. No report saved.');
 let prices={products:[]};
 try{prices=await page.evaluate(source=>{const reader=new Function('return ('+source+')')();return reader(document);},readEspGrid.toString());}
 catch(error){report.readerStatus=/ESP_[A-Z_]+/.exec(error.message)?.[0]||'NEEDS_CHECK';}
 report.version=4;
 report.verifiedCheckboxSettings=await page.evaluate(source=>(new Function('return ('+source+')')())(document),readEspSettings.toString());
 report.structure=await page.evaluate(source=>(new Function('return ('+source+')')())(document),inspectEspStructure.toString());
 report.selloutSample=prices.products.slice(0,5);
 report.productsRead=prices.products.length;
 if(!report.selloutSample.length) console.log('The grid was found, but product rows still need checking. The diagnostic report will help resolve this.');
 report.searchTests=[];
 console.log('Testing size search automatically: 225/45 R17, then 205/55 R16. No tyres will be ordered.');
 for(const size of ['225/45 R17','205/55 R16']){
  try{report.searchTests.push(await testEspSearch(page,size));}
  catch(error){report.searchTests.push({requestedSize:size,status:'NEEDS_CHECK',reason:/ESP_[A-Z_]+/.exec(error.message)?.[0]||'SEARCH_NOT_VERIFIED'});}
 }
 report.afterSearchStructure=await page.evaluate(source=>(new Function('return ('+source+')')())(document),inspectEspStructure.toString());
 const target=resolve('Vecta-Tyre-Setup-Report-v4.json');await writeFile(target,JSON.stringify(report,null,2));
 console.log('\nSaved: '+target+'\nSend this JSON report back in our tyre chat. Your password and session stay on this PC.');
 await terminal.question('Press Enter to close: ');
} finally { terminal.close();await context.close(); }
