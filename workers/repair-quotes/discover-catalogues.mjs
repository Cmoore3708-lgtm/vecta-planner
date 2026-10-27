import {chromium} from '../gsf/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {execFile} from 'node:child_process';
import {readVehicle} from '../haynes/dom.mjs';
import {repairTimesLink} from './haynes-navigation.mjs';
import {navigateGSFAlternator} from './gsf-navigation.mjs';
import {discoverGSFParts,discoverHaynesJobs} from './catalogue-discovery.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),registration='FV65JTY';
const report={version:'catalogue-discovery-1',registration,checkedAt:new Date().toISOString(),pricingApproved:false,gsf:[],haynes:[]};
const terminal=createInterface({input:process.stdin,output:process.stdout});let gsf,haynes;
const ask=message=>terminal.question(message+' Press Enter here when ready: ');
async function browser(profile){return chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});}
try{
 console.log('VECTA - AUTOMATIC REPAIR CATALOGUE INSPECTION');
 console.log('This checks all listed part categories itself. It does not approve prices, edit quotes, use baskets or place orders.');
 gsf=await browser(process.env.GSF_PROFILE_DIR||path.join(process.env.LOCALAPPDATA||here,'VectaGSF','EdgeProfile'));
 const gp=gsf.pages()[0]||await gsf.newPage();await gp.goto('https://trade.gsfcarparts.com',{waitUntil:'domcontentloaded'});await gp.bringToFront();
 await ask('Sign in to GSF in this browser if asked.');
 try{await navigateGSFAlternator(gp,registration);report.gsf=await discoverGSFParts(gp,registration,{log:console.log});}catch(error){report.gsfStatus=error.code||error.message;}
 haynes=await browser(path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes','Haynes'));
 const hp=haynes.pages()[0]||await haynes.newPage();await hp.goto('https://www.workshopdata.com/touch/site/layout/makesOverview',{waitUntil:'domcontentloaded'});await hp.bringToFront();
 await ask('Sign in to Haynes if asked. Leave it on the vehicle overview.');
 const field=hp.locator('#numberPlate,input[name="numberPlate"]');await field.fill(registration);await hp.locator('#licencePlateBtn').click();
 let vehicle;
 for(let n=0;n<60;n++){try{vehicle=await hp.evaluate(readVehicle);}catch{}if(vehicle?.registration===registration)break;await hp.waitForTimeout(250);}
 if(vehicle?.registration!==registration||!/^t_\d+$/.test(vehicle.typeId||'')||vehicle.ambiguous||vehicle.blocked)throw Error('HAYNES_VEHICLE_REVIEW_REQUIRED');
 report.haynesVehicle={registration:vehicle.registration,typeId:vehicle.typeId,make:vehicle.make,model:vehicle.model,variant:vehicle.variant};
 const links=await hp.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));await hp.goto(repairTimesLink(links,vehicle.typeId),{waitUntil:'domcontentloaded'});
 report.haynes=await discoverHaynesJobs(hp,registration,{log:console.log});
}catch(error){report.status=/Opening in existing browser session|Target.*closed|ProcessSingleton/i.test(String(error))?'PROFILE_IN_USE':error.code||error.message;console.log(report.status==='PROFILE_IN_USE'?'Close the existing GSF/service/repair worker browser and black window, then run this check again.':'Inspection ended: '+report.status);}
finally{
 const output=path.join(here,'repair-catalogue-discovery.local.json');fs.writeFileSync(output,JSON.stringify(report,null,2));
 if(process.platform==='win32')execFile('explorer.exe',['/select,',output],()=>{});
 console.log('Saved: '+output);console.log('Send repair-catalogue-discovery.local.json to this chat.');
 await ask('Inspection finished. The supplier windows will close.');terminal.close();await haynes?.close().catch(()=>{});await gsf?.close().catch(()=>{});
}
