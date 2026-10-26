// Compatibility entry point: production uses one GSF worker for both queues.
if(!process.argv.includes('--setup')){
 await import('../gsf/worker.mjs');
}else{
 const [{chromium},{default:path},{fileURLToPath},{createInterface}]=await Promise.all([import('playwright'),import('node:path'),import('node:url'),import('node:readline/promises')]);
 const here=path.dirname(fileURLToPath(import.meta.url));
 const profile=process.platform==='win32'?path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes','Haynes'):path.join(here,'profile','Haynes');
 const context=await chromium.launchPersistentContext(profile,{headless:false,acceptDownloads:false,chromiumSandbox:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 const terminal=createInterface({input:process.stdin,output:process.stdout});
 try{const page=context.pages()[0]||await context.newPage();await page.goto('https://www.workshopdata.com/touch/site/layout/makesOverview');console.log('Sign in to Haynes here. GSF sign-in is shared with the service worker: use workers/gsf/SIGN-IN-GSF.cmd.');await terminal.question('Press Enter to close this setup browser: ');}
 finally{terminal.close();await context.close();}
}
