import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SUPPLIER } from './browser.mjs';
import { inspectDocument } from './inspect-dom.mjs';
const profile = process.env.TYRE_PROFILE_DIR || resolve(process.env.LOCALAPPDATA || '.', 'VectaTyres', 'EdgeProfile');
const context = await chromium.launchPersistentContext(profile, { channel:'msedge',headless:false,acceptDownloads:false });
const terminal = createInterface({input:stdin,output:stdout});
try {
 const page=context.pages()[0] || await context.newPage();await page.goto(SUPPLIER,{timeout:30000});
 console.log('\nSign in directly in Edge, then search for 205/55 R16. Do not place an order.');
 await terminal.question('Once the results appear, return here and press Enter: ');
 if(new URL(page.url()).origin!==new URL(SUPPLIER).origin || /\/Account\/LogOn/i.test(page.url()))throw Error('The supplier results page is not open.');
 // Inject the allowlisted reader, not a full-page capture.
 const report=await page.evaluate(source=>{const reader=new Function('return ('+source+')')();return reader(document);},inspectDocument.toString());
 if(!report.tables.length)throw Error('No Sellout table headings found. No report saved.');
 const target=resolve('Vecta-Tyre-Setup-Report.json');await writeFile(target,JSON.stringify(report,null,2));
 console.log('\nSaved: '+target+'\nSend this JSON report back in our tyre chat. Your password and session stay on this PC.');
 await terminal.question('Press Enter to close: ');
} finally { terminal.close();await context.close(); }
