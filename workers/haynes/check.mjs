import { createInterface } from 'node:readline/promises';
import { openProfile, browserLookup } from './browser.mjs';
// Manual diagnostic on the host. Stop the worker first to release its Edge profile.
const context = await openProfile({headless:false});
const input = createInterface({input:process.stdin,output:process.stdout});
try {
  const registration = await input.question('Enter a registration to test: ');
  try {
    const result = await browserLookup(context,{keepFailedPage:true})(registration.toUpperCase().replace(/[^A-Z0-9]/g,''));
    console.log('MATCHED: '+result.make+' '+result.model+' '+result.variant);
  } catch (error) {
    console.log('Lookup status: '+(error.code || 'UNAVAILABLE'));
    console.log('Stage: '+(error.stage || 'OPEN_BROWSER'));
    console.log('Reason: '+(error.reason || 'BROWSER_ERROR'));
    console.log('Browser detail: '+(error.browserDetail || 'OTHER'));
    console.log('The failed search page remains open in Edge. Do not share passwords or VINs in screenshots.');
  }
  await input.question('Press Enter to close the diagnostic browser. ');
} finally { input.close(); await context.close(); }
