import {createHash} from 'node:crypto';
import {HaynesError} from '../../lib/haynes-vehicle.js';
import {readMaintenanceMenus,readConditionSchedules,readSchedule} from './service-dom.mjs';
import {servicePeriodLinks} from '../../lib/haynes-service.js';
const hash=(prefix,value)=>prefix+createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
export function menuDescriptor(menu) {
 const labels=menu.options.map(o=>clean(o.label));
 const id=hash('hm_',[menu.kind,menu.name||'',menu.label,labels]);
 const options=menu.options.map((o,index)=>({...o,id:hash('ho_',[id,index,clean(o.label)])}));
 return {...menu,id,options};
}
function publicMenu(menu){return {id:menu.id,label:clean(menu.label).slice(0,180),options:menu.options.map(o=>({id:o.id,label:clean(o.label).slice(0,600)}))};}
// Keep the existing relay payload bound and expose every supplier choice.
// Range answers are replayed locally; only the final advertised option touches Haynes.
function groupedMenu(menu){
 const groups=[];
 for(let start=0;start<menu.options.length;start+=50){
  const options=menu.options.slice(start,start+50);
  const child=menuDescriptor({...menu,options});
  groups.push({value:String(start),label:(start+1)+'–'+(start+options.length)+': '+clean(options[0].label).slice(0,80)+' … '+clean(options.at(-1).label).slice(0,80),child});
 }
 return menuDescriptor({kind:'page',name:menu.id,label:menu.label+' — choose an option range',options:groups});
}
function oversized(menu){return menu.options.length>100||Buffer.byteLength(JSON.stringify(publicMenu(menu)),'utf8')>48000;}
function choiceResult(menu,path,resetFrom) {
 const view=publicMenu(menu);
 if(oversized(menu))throw new HaynesError('INCOMPLETE');
 return {kind:'menu_choice',menu:view,path,...(resetFrom===undefined?{}:{resetFrom})};
}
function error(code){throw new HaynesError(code);}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Re-read fresh supplier controls for every replay. Client selections contain only
// opaque menu/option IDs, never supplier URLs, selector code or CSRF parameters.
export async function guidedMaintenance(page,input,vehicle,{selectCheckbox,pauseFor=pause}={}) {
 const selections=input.menuChoices||[],completed=new Set(),path=[];
 let answerIndex=0,system='',condition='';
 for(let step=0;step<32;step++) {
  let menus,links,menu,ready;
  const until=Date.now()+10000;
  do {
   const url=new URL(page.url());
   if(url.origin!=='https://www.workshopdata.com')error('MISMATCH');
   let sheet=null,finalReady=false;
   if(url.pathname==='/touch/site/layout/maintenanceSchedule') {
    if(url.searchParams.get('typeId')!==vehicle.typeId||system&&url.searchParams.get('maintenanceSystemId')!==system)error('MISMATCH');
    sheet=await page.evaluate(readSchedule);
    finalReady=/^mp_\d+$/.test(sheet.period||'')&&sheet.period===url.searchParams.get('maintenancePeriodId')&&/^ms_\d+$/.test(url.searchParams.get('maintenanceSystemId')||'');
   }
   const raw=await page.evaluate(readMaintenanceMenus);
   if(raw.unsupported.length)return {kind:'manual_step',message:'Haynes requires a maintenance control that needs manual handling: '+raw.unsupported[0].label};
   menus=raw.menus.filter(m=>!finalReady||!m.options.every(o=>/^(?:mp_|ms_)\d+(?:,|$)/.test(o.value))).map(menuDescriptor);
   menu=menus.find(m=>!completed.has(m.id));
   if(!menu&&finalReady) {
    if(answerIndex!==selections.length)error('CHOICES_CHANGED');
    return {selected:{href:url.href,label:sheet.schedule},system:url.searchParams.get('maintenanceSystemId'),conditions:path.map(x=>x.label).join(' → '),schedule:sheet};
   }
   if(!menu) {
    links=await page.evaluate(readConditionSchedules);
    const available=system?servicePeriodLinks(links,{system,typeId:vehicle.typeId}):[];
    if(available.length) {
     menu=menuDescriptor({kind:'link',name:'service-period',label:'Service type / interval',options:available.map(link=>({label:link.label,value:link.href,link}))});
     if(completed.has(menu.id))menu=null;
    }
   }
   ready=!!menu;
   if(!ready)await pauseFor(200);
  }while(!ready&&Date.now()<until);
  if(!menu)return {kind:'manual_step',message:'Haynes did not expose a supported next maintenance choice. Open the Haynes page to check the next control.'};
  const sourceMenuId=menu.id;
  while(oversized(menu))menu=groupedMenu(menu);
  while(menu.kind==='page'){
   const answer=selections[answerIndex];
   if(!answer)return choiceResult(menu,path);
   if(answer.menu!==menu.id)return choiceResult(menu,path,answerIndex);
   const option=menu.options.find(o=>o.id===answer.option);
   if(!option)return choiceResult(menu,path,answerIndex);
   answerIndex++;path.push({menu:menu.id,label:menu.label+': '+option.label});menu=option.child;
   while(oversized(menu))menu=groupedMenu(menu);
  }
  const answer=selections[answerIndex];
  if(!answer)return choiceResult(menu,path);
  // A changed menu is returned again; never apply an answer to a different menu.
  if(answer.menu!==menu.id)return choiceResult(menu,path,answerIndex);
  const option=menu.options.find(o=>o.id===answer.option);
  if(!option)return choiceResult(menu,path,answerIndex);
  answerIndex++;completed.add(sourceMenuId);completed.add(menu.id);path.push({menu:menu.id,label:menu.label+': '+option.label});
  if(menu.kind==='select') {
   const control=page.locator('select').nth(menu.index);
   await control.selectOption({value:option.value});
   if(/^ms_\d+$/.test(String(option.value).split(',')[0])) {system=String(option.value).split(',')[0];condition=option.label;}
   // Native change events can start asynchronous supplier navigation/rendering.
   await pauseFor(600);
   await page.waitForLoadState('domcontentloaded').catch(()=>{});
  } else {
   const link=option.link;
   if(link.checkboxId) {
    await selectCheckbox(page,link,links);
    const buttons=page.getByText('Continue',{exact:true});let clicked=false;
    for(let n=0;n<await buttons.count();n++)if(await buttons.nth(n).isVisible()){await buttons.nth(n).click();clicked=true;break;}
    if(!clicked)error('UNSUPPORTED_CONTROL');
   } else {
    await page.goto(link.href,{waitUntil:'domcontentloaded'});
   }
  }
 }
 return {kind:'manual_step',message:'Haynes has more maintenance steps than the current guided limit. Check the remaining choices on its page.'};
}
