import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {parseHTML} from 'linkedom';
import {transformSync} from 'esbuild';
import {mechanicVariant} from './mechanic-variant.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export const baselinePath=path.join(root,'docs/dashboard-layout-baseline.json');
const names=new Set(['plannerHtml','plannerMetricsHtml','plannerLiveControlsHtml','plannerWindowConfig','plannerTimeRows','currentTimeLineHtml','laneHtml','mobilePlannerHtml','jobCardHtml','mobileJobCardHtml','mobileJobCategoryLabel','plannerJobDescription','plannerMotHeaderHtml','mobileMotAppointmentHtml','plannerJobTypesHtml','plannerVehicleLabel','plannerPlate','fullPlate','unallocatedPanelHtml','unallocatedJobCardHtml','quotePanelHtml','myTasksHtml']);
const helperNames=new Set(['plannerArtworkProfile','plannerArtworkPolygon','trackTimedArtwork','mobileManufacturerBadge','genericDashboardArtwork','enrichHaynesDashboard','install']);
const sharedNames=['plannerHtml','laneHtml','mobilePlannerHtml','jobCardHtml','mobileJobCardHtml','mobileJobCategoryLabel','plannerJobDescription','plannerMotHeaderHtml','mobileMotAppointmentHtml','plannerJobTypesHtml','plannerVehicleLabel','plannerPlate','unallocatedJobCardHtml'];
const protectedSelector=/[.#](?:app|main|content|top|side|nav|dateCtl|currentDate|todayBtn|job|jobTypeCoded|jobVehicle|lane|head|time|timeCol|ukPlate|uniformRegPlate|ukStrip|quoteCard|websiteBookingOutline|planner[\w-]*|mobile(?:Planner|Job|Group|Vehicle|Manufacturer|Mot)[\w-]*|livePriority[\w-]*|unallocated[\w-]*|sideJob[\w-]*|task[\w-]*|resize[\w-]*|miniPlanner[\w-]*|haynesDashboard[\w-]*|requestCard|timeOff[\w-]*)\b/;
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonicalJS=source=>transformSync(source,{loader:'js',target:'esnext',minifyWhitespace:true,minifyIdentifiers:false,minifySyntax:false,legalComments:'none'}).code;
const canonicalCSS=source=>transformSync(source,{loader:'css',minifyWhitespace:true,minifyIdentifiers:false,minifySyntax:false,legalComments:'none'}).code;
const assetName=url=>path.basename(url).replace(/-[a-f0-9]{10}(?=\.(?:css|js)$)/,'');
function localAsset(url,base){
 if(!url.startsWith('/')||url.startsWith('//'))return null;
 const file=path.resolve(base,'.'+url.split('?')[0]);
 if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Layout asset escapes build root');
 return fs.readFileSync(fs.existsSync(file)?file:path.join(base,'public',url.split('?')[0]),'utf8');
}
function cssProjection(css){
 // CSSOM preserves cascade order; include all dashboard selectors and global rules.
 const {document}=parseHTML('<html><head><style>'+css+'</style></head><body></body></html>');
 function visit(rules){let result='';for(const rule of rules){
  if(rule.cssRules){const body=visit(rule.cssRules);if(body)result+=rule.cssText.slice(0,rule.cssText.indexOf('{')+1)+body+'}';continue;}
  if(!rule.selectorText)continue;
  const selectors=rule.selectorText;
  if(protectedSelector.test(selectors)||selectors.split(',').some(s=>!/[.#]/.test(s)))result+=rule.cssText;
 }return result;}
 return canonicalCSS(visit(document.querySelector('style').sheet.cssRules));
}
export function captureDashboardLayout(html,{base=root,readAsset=url=>localAsset(url,base)}={}){
 const {document}=parseHTML(html),functions={},depths={},styles=[],injected=[];
 // A booking-calendar helper also has a nested plannerHtml name. Lock the
 // shallowest application definition; bundling may rename the nested helper.
 const add=(name,value,depth)=>{if(depths[name]===undefined||depth<depths[name]){depths[name]=depth;functions[name]=[];}if(depth===depths[name])functions[name].push(sha(canonicalJS(value)));};
 for(const element of document.querySelectorAll('style,link[rel="stylesheet"],script')){
  const tag=element.tagName.toLowerCase();
  if(tag==='style'||tag==='link'){
   const css=tag==='style'?element.textContent:readAsset(element.getAttribute('href')||'');if(css==null)continue;
   const projected=cssProjection(css);if(projected.trim())styles.push({name:tag==='style'?(element.id||'inline'):assetName(element.getAttribute('href')),media:element.getAttribute('media')||'',css:projected});continue;
  }
  const src=element.getAttribute('src')||'',source=src?readAsset(src):element.textContent;if(!source?.trim())continue;
  if(element.getAttribute('type')&&element.getAttribute('type')!=='module'&&element.getAttribute('type')!=='text/javascript')continue;
  const isHelper=src&&assetName(src)==='haynes-job-tools.js';
  // Only parse scripts which can contain a protected renderer or injected dashboard style.
  if(!isHelper&&![...names].some(n=>source.includes('function '+n+'('))&&!/style\.textContent[\s\S]*?(?:planner|mechanicWorkComplete)/.test(source))continue;
  const ast=parse(source,{sourceType:'unambiguous',allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true});
  const stack=[{node:ast.program,depth:0}];while(stack.length){const {node,depth}=stack.pop();if(!node||typeof node!=='object')continue;
   if(node.type==='FunctionDeclaration'&&((!isHelper&&names.has(node.id?.name))||(isHelper&&helperNames.has(node.id?.name))))add((isHelper?'artwork.':'')+node.id.name,source.slice(node.start,node.end),depth);
   if(node.type==='AssignmentExpression'){
    const name=node.left?.type==='Identifier'?node.left.name:node.left?.property?.name;
    if((node.right?.type==='FunctionExpression'||node.right?.type==='ArrowFunctionExpression')&&((isHelper&&helperNames.has(name))||(!isHelper&&names.has(name))))add((isHelper?'artwork.':'')+name,source.slice(node.start,node.end),depth);
    if(name==='textContent'&&node.left?.object?.name==='style'){
     const value=source.slice(node.right.start,node.right.end);if(/planner|\.job|mobile/.test(value))injected.push(sha(canonicalJS('('+value+')')));
    }
   }
   for(const [key,value] of Object.entries(node)){if(['loc','comments','tokens','extra'].includes(key))continue;const nextDepth=depth+(/Function|Method/.test(node.type)?1:0);if(Array.isArray(value))stack.push(...value.filter(v=>v&&typeof v==='object').map(node=>({node,depth:nextDepth})));else if(value&&typeof value==='object'&&value.type)stack.push({node:value,depth:nextDepth});}
  }
 }
 for(const name of [...names,...[...helperNames].map(n=>'artwork.'+n)])if(!functions[name])throw Error('Protected dashboard renderer missing: '+name);
 return {functions:Object.fromEntries(Object.entries(functions).sort(([a],[b])=>a.localeCompare(b))),styles:sha(JSON.stringify(styles)),injectedStyles:injected};
}
export function captureBoth({html=fs.readFileSync(path.join(root,'index.html'),'utf8'),built=false,readAsset}={}){
 const base=built?path.join(root,'dist'):root;
 const main=built?fs.readFileSync(path.join(base,'index.html'),'utf8'):html;
 const mechanic=built?fs.readFileSync(path.join(base,'mechanic.html'),'utf8'):mechanicVariant(html);
 const result={main:captureDashboardLayout(main,{base,readAsset}),mechanic:captureDashboardLayout(mechanic,{base,readAsset})};
 for(const name of sharedNames)if(JSON.stringify(result.main.functions[name])!==JSON.stringify(result.mechanic.functions[name]))throw Error('Main/mechanics dashboard display diverged: '+name);
 return result;
}
export function checkLayout(actual,baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'))){
 const differences=[];for(const entry of ['main','mechanic']){
  for(const section of ['functions','styles','injectedStyles']){
   if(section==='functions'){for(const name of new Set([...Object.keys(baseline.layout[entry][section]),...Object.keys(actual[entry][section])]))if(JSON.stringify(actual[entry][section][name])!==JSON.stringify(baseline.layout[entry][section][name]))differences.push(entry+'.'+name);}
   else if(JSON.stringify(actual[entry][section])!==JSON.stringify(baseline.layout[entry][section]))differences.push(entry+'.'+section);
  }
 }
 if(differences.length)throw Error('DASHBOARD LAYOUT LOCK: unapproved changes to '+differences.join(', ')+'. Preserve Chris’s approved PC/phone layout. See DASHBOARD-LAYOUT-LOCK.md; do not refresh the baseline to make a build pass.');
 return true;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 checkLayout(captureBoth({built:process.argv.includes('--built')}));console.log('Approved Main/mechanics PC and phone dashboard layout verified'+(process.argv.includes('--built')?' in production output.':'.'));
}
