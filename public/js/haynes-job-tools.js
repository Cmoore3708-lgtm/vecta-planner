(function(root){
'use strict';
const reg=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function lookupRegistration(value){const r=reg(value);return /^[A-Z0-9]{2,8}$/.test(r)&&/[A-Z]/.test(r)&&/\d/.test(r)&&! /^(?:UNKNOWN|NOREG|NOTKNOWN|PENDING|RESCUE)\d*$/.test(r);}
const make=v=>{const key=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return {VW:'VOLKSWAGEN',MERCEDES:'MERCEDESBENZ'}[key]||key;};
const image=v=>/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(v||'')?v:'';
const words=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
// Model spacing varies between internal fleet names and Haynes (NV 200 / NV200).
const modelWords=v=>words(v).replace(/([A-Z])\s+(?=\d)/g,'$1').replace(/(\d)\s+([A-Z])(?=\s|$)/g,'$1$2');
function vehicleLink(v){
 if(!/^t_\d+$/.test(v?.typeId||''))return '';
 const confirmed=reg(v.registration)==='CM14KEL'&&v.typeId==='t_619108899'?'148229':'';
 const ktypNr=/^\d{1,12}$/.test(String(v.ktypNr||''))?String(v.ktypNr):confirmed;
 return 'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId='+encodeURIComponent(v.typeId)+(ktypNr?'&ktypNr='+encodeURIComponent(ktypNr):'');
}
const KEY='vecta_haynes_vehicle_snapshots_v1',TTL=86400000,cache=new Map(),pending=new Map(),failed=new Map(),failStatus=new Map();
let dailyBlockedUntil=0;
// Vehicle identity is stable; service schedules still have their own mileage-aware cache.
const ID_KEY='vecta_haynes_vehicle_identity_v1',identities=new Map();
const RETRY_KEY='vecta_haynes_vehicle_retries_v1';
const pausedStatuses=['AMBIGUOUS','UNAVAILABLE','UNKNOWN','NOT_FOUND','INCOMPLETE','MISMATCH'];
function persistRetries(){try{root.localStorage?.setItem(RETRY_KEY,JSON.stringify([...failed].map(([registration,at])=>({registration,at,status:failStatus.get(registration)}))));}catch{}}
try{for(const entry of JSON.parse(root.localStorage?.getItem(RETRY_KEY)||'[]'))if(/^[A-Z0-9]{2,8}$/.test(entry.registration)&&Number.isFinite(entry.at)&&entry.at<=Date.now()&&(Date.now()-entry.at<TTL||pausedStatuses.includes(entry.status))){failed.set(entry.registration,entry.at);failStatus.set(entry.registration,entry.status||'UNAVAILABLE');if(entry.status==='DAILY_LIMIT')dailyBlockedUntil=(Math.floor(entry.at/TTL)+1)*TTL;}}catch{}
function identitySnapshot(registration,expectedMake,expectedModel){const v=identities.get(reg(registration));return compatibleArtwork(v,{make:expectedMake,model:expectedModel})&&(!expectedModel||knownAssetMatches(v,{make:expectedMake,model:expectedModel}))?v:null;}
function rememberIdentity(v,persist=true){
 if(!v||! /^[A-Z0-9]{2,8}$/.test(reg(v.registration))||!vehicleLink(v)||!v.make||!v.model||!v.variant||!Number.isFinite(Date.parse(v.fetchedAt))||Date.parse(v.fetchedAt)>Date.now())return;
 const clean={registration:reg(v.registration),make:String(v.make).slice(0,100),model:String(v.model).slice(0,180),variant:String(v.variant).slice(0,180),engineCode:String(v.engineCode||'').slice(0,100),modelYears:String(v.modelYears||'').slice(0,100),vehicle:String(v.vehicle||[v.make,v.model,v.variant].join(' ')).slice(0,360),typeId:v.typeId,...(/^\d{1,12}$/.test(String(v.ktypNr||''))?{ktypNr:String(v.ktypNr)}:{}),imageUrl:image(v.imageUrl),...(root.VectaVehicleImage?.colourHex(v.colour)?{colour:v.colour}:{}),fetchedAt:v.fetchedAt};
 identities.set(clean.registration,clean);
 if(persist)try{root.localStorage?.setItem(ID_KEY,JSON.stringify([...identities.values()]));}catch{}
 return clean;
}
try{for(const v of JSON.parse(root.localStorage?.getItem(ID_KEY)||'[]'))rememberIdentity(v,false);}catch{}
// Artwork survives technical-data expiry; it must never expose technical links.
const ART_KEY='vecta_haynes_artwork_v1',artwork=new Map();
const SHARED_ART_PREFIX='vehicle_artwork:',sharedArtwork=new Map(),sharedWrites=new Map(),sharedRefresh=new WeakMap();
let sharedClient=null,sharedLoading=null,sharedSaving=null,sharedTimer=null,sharedRetryAt=0,sharedReadAt=0;
function workshopClient(){return typeof root.__vectaWorkshopClient==='function'?root.__vectaWorkshopClient():root.remoteClient;}
async function sharedArtworkResponse(request){
 let timer;try{return await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Shared artwork timeout')),10000);})]);}finally{clearTimeout(timer);}
}
function cleanArtwork(v){
 if(!v||! /^[A-Z0-9]{2,12}$/.test(reg(v.registration))||!image(v.imageUrl)||!v.make||!v.model)return null;
 return {registration:reg(v.registration),make:String(v.make).slice(0,100),model:String(v.model).slice(0,180),imageUrl:image(v.imageUrl),...(root.VectaVehicleImage?.colourHex(v.colour)?{colour:v.colour}:{}),...(v.generic?{generic:true}:{}),...(v.manual?{manual:true}:{})};
}
function queueSharedArtwork(v,{replace=false}={}){
 const client=workshopClient(),clean=cleanArtwork(v);
 if(!client||root.VECTA_AUDIT_PREVIEW||!clean)return;
 if(client!==sharedClient){sharedWrites.set(clean.registration,clean);hydrateSharedArtwork();return;}
 const saved=sharedArtwork.get(clean.registration);
 if(saved?.manual&&!clean.manual)return;
 if(!clean.colour&&saved?.colour)clean.colour=saved.colour;
 if(saved&&!saved.generic&&saved.imageUrl!==clean.imageUrl&&compatibleArtwork(saved,clean)&&!replace)return;
 // Keep a previously shared selection instead of replacing it with a new model guess.
 if(saved&&(JSON.stringify(saved)===JSON.stringify(clean)||clean.generic&&compatibleArtwork(saved,clean)))return;
 sharedWrites.set(clean.registration,clean);
 if(!sharedTimer&&!sharedSaving&&Date.now()>=sharedRetryAt)sharedTimer=setTimeout(()=>{sharedTimer=null;flushSharedArtwork();},100);
}
function flushSharedArtwork(){
 const client=workshopClient();
 if(sharedSaving)return sharedSaving;
 if(!client||client!==sharedClient||root.navigator?.onLine===false||root.VECTA_AUDIT_PREVIEW||!sharedWrites.size||Date.now()<sharedRetryAt)return Promise.resolve(false);
 const batch=[...sharedWrites.values()],stamp=new Date().toISOString();
 sharedSaving=(async()=>{try{
  const response=await sharedArtworkResponse(client.from('workshop_settings').upsert(batch.map(value=>({id:SHARED_ART_PREFIX+value.registration,value,updated_at:stamp})),{onConflict:'id'}));
  if(response.error)throw response.error;
  for(const value of batch){sharedArtwork.set(value.registration,value);if(JSON.stringify(sharedWrites.get(value.registration))===JSON.stringify(value))sharedWrites.delete(value.registration);}
  return true;
 }catch{sharedRetryAt=Date.now()+300000;return false;}finally{sharedSaving=null;if(sharedWrites.size&&!sharedTimer&&Date.now()>=sharedRetryAt)sharedTimer=setTimeout(()=>{sharedTimer=null;flushSharedArtwork();},100);}})();
 return sharedSaving;
}
function hydrateSharedArtwork({refresh=false}={}){
 const client=workshopClient();
 if(!client||root.VECTA_AUDIT_PREVIEW||root.navigator?.onLine===false||sharedClient===client&&(!refresh||Date.now()-sharedReadAt<60000)||Date.now()<sharedRetryAt)return null;
 if(sharedLoading)return sharedLoading;
 sharedReadAt=Date.now();
 sharedLoading=(async()=>{try{
  const query=client.from('workshop_settings').select('id,value');const response=await sharedArtworkResponse((typeof query.or==='function'?query.or('id.like.vehicle_artwork:%,id.like.vehicle_colour:%'):query.like('id',SHARED_ART_PREFIX+'%')).limit(2000));
  if(response.error)throw response.error;
  for(const row of response.data||[]){if(row.id==='vehicle_colour:'+reg(row.value?.registration)){rememberLookupColour({registration:row.value.registration,make:row.value.make,primaryColour:row.value.colour});continue;}const clean=cleanArtwork(row.value);if(clean&&row.id===SHARED_ART_PREFIX+clean.registration){const local=artwork.get(clean.registration);if(sharedWrites.has(clean.registration))continue;if(!clean.colour&&local?.colour)clean.colour=local.colour;sharedArtwork.set(clean.registration,clean);if(clean.manual||!local||compatibleArtwork(clean,local))rememberArtwork(clean,false,{replace:true});}}
  sharedClient=client;
  // Upgrade existing device caches in one batch, never a write per rendered card.
  for(const value of artwork.values())queueSharedArtwork(value);
  try{root.localStorage?.setItem(ART_KEY,JSON.stringify([...artwork.values()]));}catch{}
  return true;
 }catch{sharedRetryAt=Date.now()+300000;return false;}finally{sharedLoading=null;}})();
 return sharedLoading;
}
function rememberArtwork(v,persist=true,{replace=false}={}){
 const clean=cleanArtwork(v);if(!clean)return;
 const previous=artwork.get(clean.registration);if(previous?.manual&&!clean.manual)return previous;if(previous&&!previous.generic&&compatibleArtwork(previous,clean)&&(clean.generic||previous.imageUrl!==clean.imageUrl)&&!replace)return previous;if(!clean.colour&&previous?.colour)clean.colour=previous.colour;
 if(persist)queueSharedArtwork(clean,{replace});
 const existing=artwork.get(clean.registration);if(existing&&existing.make===clean.make&&existing.model===clean.model&&existing.imageUrl===clean.imageUrl&&existing.colour===clean.colour&&!!existing.manual===!!clean.manual&&!!existing.generic===!!clean.generic)return;
 artwork.set(clean.registration,clean);
 if(persist)try{root.localStorage?.setItem(ART_KEY,JSON.stringify([...artwork.values()]));}catch{}
}
try{for(const v of JSON.parse(root.localStorage?.getItem(ART_KEY)||'[]'))rememberArtwork(v,false);}catch{}
// Hydrate once without rewriting the full artwork/identity collections per row.
try{for(const v of JSON.parse(root.localStorage?.getItem(KEY)||'[]'))if(vehicleLink(v)){rememberArtwork(v,false);rememberIdentity(v,false);}}catch{}
function artworkSnapshot(registration,expectedMake,expectedModel){return [artwork.get(reg(registration)),sharedArtwork.get(reg(registration))].sort((a,b)=>Number(!!a?.generic)-Number(!!b?.generic)).find(v=>v?.manual||compatibleArtwork(v,{make:expectedMake,model:expectedModel})&&(!expectedModel||knownAssetMatches(v,{make:expectedMake,model:expectedModel})))||null;}
try{for(const v of JSON.parse(root.localStorage?.getItem(KEY)||'[]'))remember(v,false);}catch{}
function valid(v,registration,expectedMake){return !!(v&&reg(v.registration)===reg(registration)&&vehicleLink(v)&&v.make&&v.model&&v.variant&&(!expectedMake||make(v.make)===make(expectedMake))&&Number.isFinite(Date.parse(v.fetchedAt))&&Date.now()-Date.parse(v.fetchedAt)>=0&&Date.now()-Date.parse(v.fetchedAt)<TTL);}
function remember(v,persist=true,{replaceArtwork=false}={}){
 if(!valid(v,v?.registration))return;
 const clean={registration:reg(v.registration),make:String(v.make).slice(0,100),model:String(v.model).slice(0,180),variant:String(v.variant).slice(0,180),engineCode:String(v.engineCode||'').slice(0,100),modelYears:String(v.modelYears||'').slice(0,100),vehicle:String(v.vehicle||[v.make,v.model,v.variant].join(' ')).slice(0,360),typeId:v.typeId,...(/^\d{1,12}$/.test(String(v.ktypNr||''))?{ktypNr:String(v.ktypNr)}:{}),imageUrl:image(v.imageUrl),...(root.VectaVehicleImage?.colourHex(v.colour)?{colour:v.colour}:{}),fetchedAt:v.fetchedAt};
 cache.set(clean.registration,clean);while(cache.size>300)cache.delete(cache.keys().next().value);
 rememberArtwork(clean,persist,{replace:replaceArtwork});rememberIdentity(clean,persist);
 if(persist)try{root.localStorage?.setItem(KEY,JSON.stringify([...cache.values()].filter(x=>valid(x,x.registration))));}catch{}
 return clean;
}
function snapshot(registration,expectedMake,expectedModel){const v=cache.get(reg(registration));return valid(v,registration,expectedMake)&&compatibleArtwork(v,{make:expectedMake,model:expectedModel})&&(!expectedModel||knownAssetMatches(v,{make:expectedMake,model:expectedModel}))?v:null;}
// Generic artwork is a visual hint only; it has no registration or technical ID.
const modelImages=[
 {make:'Nissan',model:'Qashqai',imageUrl:'https://www.haynespro-assets.com/workshop/images/319004648.svgz'},
 {make:'Ford',model:'Transit',imageUrl:'https://www.haynespro-assets.com/workshop/images/319118141.svgz'}
];
// Registration alone cannot validate a stale/misidentified vehicle from another Nissan.
function compatibleArtwork(value,description){
 if(!value)return false;
 if(description?.make&&value.make&&make(description.make)!==make(value.make))return false;
 const normal=(v,manufacturer)=>{let text=modelWords(v);const prefix=modelWords(manufacturer);if(prefix&&text.startsWith(prefix+' '))text=text.slice(prefix.length+1);return text.replace(/^(?:NISSAN|FORD|MERCEDES BENZ|INFINITI|CITROEN|RENAULT|VOLKSWAGEN|VW|AUDI) /,'');};
 const expected=normal(description?.model||description?.vehicle,description?.make||value.make),actual=normal(String(value.model||'').split(/[(/]/)[0],value.make);
 if(!expected||!actual)return true;
 const family=v=>v.split(' ')[0];
 const alternatives=String(value.model||'').split('/').map(part=>normal(part.split('(')[0],value.make)).filter(Boolean);
 return alternatives.some(model=>expected===model||family(expected)===family(model)||(' '+model+' ').includes(' '+expected+' '));
}
function knownAssetMatches(value,description){const known=modelImages.find(v=>v.imageUrl===value?.imageUrl);return !known||compatibleArtwork(known,description);}
function genericImage(description){
 if(!description||description.no_vehicle)return null;
 const text=' '+modelWords(description.model||description.vehicle)+' ',expectedMake=make(description.make);
 const fleetModel=root.VectaFleetImages?.modelArtwork?.(description.model||description.vehicle);
 if(image(fleetModel?.imageUrl)&&compatibleArtwork(fleetModel,description)&&knownAssetMatches(fleetModel,description)&&(!expectedMake||make(fleetModel.make)===expectedMake))return {make:fleetModel.make,model:fleetModel.model,imageUrl:fleetModel.imageUrl,generic:true};
 const candidates=[...sharedArtwork.values(),...artwork.values(),...identities.values(),...cache.values(),...modelImages].filter(v=>!v.manual&&image(v.imageUrl)&&knownAssetMatches(v,description)).map(v=>({make:v.make,model:String(v.model).split(/[(/]/)[0].trim(),imageUrl:v.imageUrl})).sort((a,b)=>b.model.length-a.model.length);
 for(const v of candidates){const model=modelWords(v.model),family=model.split(' ')[0],modelMatch=model&&text.includes(' '+model+' ')||/^[A-Z]+\d+[A-Z0-9]*$/.test(family)&&text.includes(' '+family+' ');if(modelMatch&&(!expectedMake||make(v.make)===expectedMake))return {make:v.make,model:v.model,imageUrl:v.imageUrl,generic:true};}
 return null;
}
async function lookup(registration,expectedMake,{requireImage=false,force=false,background=true}={}){
 const requested=reg(registration);if(!lookupRegistration(requested)){failStatus.set(requested,'INVALID_REGISTRATION');return null;}const hit=identitySnapshot(requested,expectedMake)||snapshot(requested,expectedMake);if(hit&&!force)return hit;
 if(Date.now()<dailyBlockedUntil){failStatus.set(requested,'DAILY_LIMIT');return null;}
 if(!/^[A-Z0-9]{2,8}$/.test(requested)||root.navigator?.onLine===false||!force&&(background&&pausedStatuses.includes(failStatus.get(requested))||Date.now()-(failed.get(requested)||0)<(background?TTL:300000)))return null;
 if(!pending.has(requested)){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  pending.set(requested,(async()=>{try{const r=await root.fetch('/api/haynes-vehicle?reg='+encodeURIComponent(requested)+(force?'&retry=1':''),{...(force?{method:'POST'}:{}),signal:controller.signal,cache:'no-store'}),d=await r.json();if(!r.ok||d.status!=='MATCHED'||!valid(d.vehicle,requested))throw Error(['NOT_CONFIGURED','OFFLINE','LOGIN_REQUIRED','VERIFICATION_REQUIRED','BUSY','DAILY_LIMIT',...pausedStatuses].includes(d.status)?d.status:'UNAVAILABLE');failed.delete(requested);failStatus.delete(requested);persistRetries();return remember(d.vehicle,true,{replaceArtwork:force});}catch(e){if(e.message==='DAILY_LIMIT')dailyBlockedUntil=(Math.floor(Date.now()/TTL)+1)*TTL;failed.set(requested,Date.now());failStatus.set(requested,e.message);while(failed.size>300){const oldest=failed.keys().next().value;failed.delete(oldest);failStatus.delete(oldest);}persistRetries();return null;}finally{clearTimeout(timer);pending.delete(requested);}})());
 }
 const v=await pending.get(requested);return v&&reg(v.registration)===requested&&(!expectedMake||make(v.make)===make(expectedMake))?v:null;
}
function artworkUrl(src){const safe=image(src);return /\.svgz?$/.test(safe)?'/api/haynes-image?asset='+encodeURIComponent(safe.split('/').pop())+'&format=svg':safe;}
function storedDrawing(description){const internal=root.VectaFleetImages?.forJob?.(description);if(internal)return internal.drawing;return artworkSnapshot(description.registration,description.make,description.model||description.vehicle)||[identitySnapshot(description.registration,description.make,description.model||description.vehicle),snapshot(description.registration,description.make,description.model||description.vehicle)].find(v=>v?.imageUrl)||genericImage(description);}
function artworkSource(img,src,description,colour){if(/\.svgz?$/.test(src)&&root.VectaVehicleImage?.mount){img.dataset.vehicleSource=src;img.src=artworkUrl(src);}else img.src=src;}
function thumbnail(v,className,description){const src=image(v?.imageUrl);if(!src)return null;const img=document.createElement('img');artworkSource(img,src,description,description?dashboardColour(description):'');if(description){img.dataset.registration=reg(description.registration);if(description.fleet_vehicle_id)img.dataset.fleetArtworkId=String(description.fleet_vehicle_id);}img.className=className;img.alt=(v.generic?'Generic model image: ':'Representative ')+v.make+' '+v.model;img.title=v.generic?'Generic model image — appearance may differ':img.alt;img.dataset.generic=String(!!v.generic);img.dataset.vehicleMake=v.make||'';let retries=0;img.onerror=()=>{if(retries>=2)return;const delay=++retries===1?1500:5000;setTimeout(()=>{if(!img.isConnected||img.src.startsWith('data:'))return;img.src=src;delete img.dataset.personalising;root.VectaVehicleImage?.mount(img.parentElement);},delay);};img.draggable=false;return img;}
let dashboardTail=Promise.resolve();
const dashboardRequests=new Map();
const dashboardObservers=new WeakMap();
function visibleCard(card){if(!card.isConnected)return false;if(!root.innerHeight||!card.getBoundingClientRect)return true;const box=card.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>=0&&box.top<root.innerHeight;}
// Paint colour is stable vehicle metadata, not a daily MOT/tax result.
// Keep successful colours until a newer confirmed result or user choice replaces them.
const colourKey='vecta_dashboard_vehicle_colours_v1',colourRetryKey='vecta_dashboard_colour_retries_v1',COLOUR_RETRY=300000,colourCache=new Map(),colourFailures=new Map(),colourPending=new Map();
function persistColourFailures(){try{root.localStorage?.setItem(colourRetryKey,JSON.stringify([...colourFailures]));}catch{}}
try{for(const [registration,at] of JSON.parse(root.localStorage?.getItem(colourRetryKey)||'[]'))if(lookupRegistration(registration)&&Number.isFinite(at)&&at<=Date.now()&&Date.now()-at<COLOUR_RETRY)colourFailures.set(registration,at);}catch{}
try{for(const entry of JSON.parse(root.localStorage?.getItem(colourKey)||'[]'))if(/^[A-Z0-9]{2,8}$/.test(entry.registration)&&Number.isFinite(entry.at)&&entry.at<=Date.now())colourCache.set(entry.registration,entry);}catch{}
function dashboardColour(job){
 const fleetChoice=root.VectaFleetImages?.forJob?.(job);if(fleetChoice?.vehicle?.artwork&&fleetChoice.vehicle.colour)return fleetChoice.vehicle.colour;
 const choice=artworkSnapshot(job.registration);if(choice?.manual&&choice.colour)return choice.colour;
 const registration=reg(job.registration),vehicle=registration?(root.app?.vehicles||[]).find(v=>reg(v.registration)===registration):null;
 const fleet=registration?(root.__vectaFleetState?.()?.vehicles||root.fleetVehicles||[]).find(v=>reg(v.registration)===registration):null;
 const saved=colourCache.get(registration),cached=saved&&(!job.make||make(saved.make)===make(job.make))?saved.colour:'';
 const supplied=job.vehicle_colour||job.colour||job.color||vehicle?.colour||vehicle?.color||fleet?.colour||fleet?.color||cached||artworkSnapshot(registration,job.make)?.colour||'';
 return root.VectaVehicleImage?.resolveColour(registration,supplied)||supplied;
}
function rememberLookupColour(data,expectedMake){
 const registration=reg(data?.registration);
 if(!/^[A-Z0-9]{5,8}$/.test(registration)||(expectedMake&&make(data.make)!==make(expectedMake))||!root.VectaVehicleImage?.colourHex(data.primaryColour))return false;
 colourFailures.delete(registration);persistColourFailures();
 colourCache.set(registration,{registration,make:data.make,colour:data.primaryColour,at:Date.now()});
 try{root.localStorage?.setItem(colourKey,JSON.stringify([...colourCache.values()]));}catch{}
 return true;
}
async function lookupDashboardColour(job){
 const registration=reg(job.registration);
 if(!root.VectaVehicleImage||root.VectaVehicleImage.colourHex(dashboardColour(job))||!lookupRegistration(registration)||! /^[A-Z0-9]{5,8}$/.test(registration)||root.navigator?.onLine===false||Date.now()-(colourFailures.get(registration)||0)<COLOUR_RETRY)return;
 if(colourPending.has(registration))return colourPending.get(registration);
 const task=(async()=>{try{
  const response=await root.fetch('/api/vehicle-lookup?reg='+encodeURIComponent(registration),{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await response.json();
  if(!response.ok||reg(data.registration)!==registration||!rememberLookupColour(data,job.make))throw Error('Colour unavailable');
 }catch{colourFailures.set(registration,Date.now());while(colourFailures.size>300)colourFailures.delete(colourFailures.keys().next().value);persistColourFailures();}
 })();colourPending.set(registration,task);
 try{await task;}finally{if(colourPending.get(registration)===task)colourPending.delete(registration);}
}
// Match the description's exclusion area to the painted car, not its rectangular canvas.
// Sampling is local, once per loaded source: it never starts a Haynes lookup.
const artworkProfiles=new WeakMap(),timedArtwork=new WeakMap();
function plannerArtworkProfile(img){
 const src=img.currentSrc||img.src,previous=artworkProfiles.get(img);
 if(previous?.src===src)return previous.profile;
 let profile=null;
 try{
  const scale=128/Math.max(img.naturalWidth,img.naturalHeight),width=Math.max(1,Math.round(img.naturalWidth*scale)),height=Math.max(1,Math.round(img.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext?.('2d',{willReadFrequently:true});
  if(context){
   context.drawImage(img,0,0,width,height);const pixels=context.getImageData(0,0,width,height).data,left=[];
   for(let y=0;y<height;y++){let x=0;while(x<width&&pixels[(y*width+x)*4+3]<32)x++;left.push(x);}
   if(left.some(x=>x<width))profile={width,height,left};
  }
 }catch{/* A cross-origin or unreadable image keeps the conservative rectangular margin. */}
 artworkProfiles.set(img,{src,profile});return profile;
}
function plannerArtworkPolygon(profile,box){
 const {width,height,scrollTop,imageLeft,imageTop,imageWidth,imageHeight}=box,points=[];
 const extent=Math.ceil(height+scrollTop),clearance=6;
 for(let y=0;y<=Math.ceil(height);y+=2){
  let left=width;
  // Include a small vertical clearance as well, so letters never touch the body or wheels.
  const first=Math.floor((y-imageTop-clearance)/imageHeight*profile.height),last=Math.ceil((y-imageTop+clearance+2)/imageHeight*profile.height);
  for(let row=Math.max(0,first);row<=Math.min(profile.height-1,last);row++)if(profile.left[row]<profile.width)left=Math.min(left,imageLeft+profile.left[row]/profile.width*imageWidth-clearance);
  points.push([Math.max(0,Math.min(width,left)),Math.min(extent,y+scrollTop)]);
 }
 const point=p=>p.map(v=>Math.round(v*10)/10+'px').join(' ');
 return 'polygon('+[[width,0],[width,extent],...points.reverse(),[width,0]].map(point).join(',')+')';
}
function trackTimedArtwork(card,img){
 if(!card?.matches('.job'))return;
 const tracked=timedArtwork.get(img);if(tracked){tracked();return;}
 let observer;
 const work=card.querySelector('.plannerWorkRequired');
 const clear=()=>{card.classList.remove('plannerArtworkWrapped');work?.querySelector('.plannerArtworkExclusion')?.remove();};
 const update=()=>{
  if(!img.isConnected){observer?.disconnect();work?.removeEventListener('scroll',update);return;}
  const box=img.getBoundingClientRect();
  if(!img.naturalWidth||!img.naturalHeight||!box.width||!box.height){clear();return;}
  const drawnWidth=Math.min(box.width,box.height*img.naturalWidth/img.naturalHeight);
  card.style.setProperty('--planner-vehicle-text-inset',Math.ceil(drawnWidth+12)+'px');
  // The make/model sits near the roof: reserve its painted edge, not the wider bonnet below.
  const profile=plannerArtworkProfile(img),identity=card.querySelector('.plannerJobVehicle');
  if(identity&&profile){
   const line=identity.getBoundingClientRect(),header=card.querySelector('.plannerJobHeader').getBoundingClientRect();
   const drawnHeight=drawnWidth*img.naturalHeight/img.naturalWidth;
   let edge=box.right;
   const first=Math.max(0,Math.floor((line.top-box.top-6)/drawnHeight*profile.height));
   const last=Math.min(profile.height-1,Math.ceil((line.bottom-box.top+6)/drawnHeight*profile.height));
   for(let row=first;row<=last;row++)if(profile.left[row]<profile.width)edge=Math.min(edge,box.right-drawnWidth+profile.left[row]/profile.width*drawnWidth);
   const available=Math.max(0,edge-header.left-6);
   card.style.setProperty('--planner-identity-text-inset',Math.max(0,Math.ceil(card.clientWidth-available))+'px');
  }else card.style.removeProperty('--planner-identity-text-inset');
  if(!work||!work.textContent.trim()||root.matchMedia?.('(max-width:768px)').matches||root.CSS?.supports&&!root.CSS.supports('shape-outside','polygon(0 0,100% 0,100% 100%)')){clear();return;}
  if(!profile){clear();return;}
  card.classList.add('plannerArtworkWrapped');
  let exclusion=work.querySelector('.plannerArtworkExclusion');
  if(!exclusion){exclusion=document.createElement('span');exclusion.className='plannerArtworkExclusion';exclusion.setAttribute('aria-hidden','true');work.prepend(exclusion);}
  const textBox=work.getBoundingClientRect(),drawnHeight=drawnWidth*img.naturalHeight/img.naturalWidth;
  // Dashboard artwork uses object-position:right top; the float occupies that same coordinate space.
  const width=Math.max(0,Math.min(textBox.width,textBox.right-(box.right-drawnWidth)+6));
  const geometry={width,height:work.clientHeight,scrollTop:work.scrollTop,imageLeft:box.right-drawnWidth-(textBox.right-width),imageTop:box.top-textBox.top,imageWidth:drawnWidth,imageHeight:drawnHeight};
  const shape=plannerArtworkPolygon(profile,geometry);
  exclusion.style.width=width+'px';exclusion.style.height=Math.ceil(geometry.height+geometry.scrollTop)+'px';
  if(exclusion.style.shapeOutside!==shape)exclusion.style.shapeOutside=shape;
 };
 timedArtwork.set(img,update);img.addEventListener('load',update);img.addEventListener('error',clear);work?.addEventListener('scroll',update,{passive:true});
 // Resize notifications run after layout; defer our writes to avoid observer feedback errors.
 let frame=null;
 const schedule=()=>{if(frame!==null)return;if(!root.requestAnimationFrame){update();return;}frame=root.requestAnimationFrame(()=>{frame=null;update();});};
 if(root.ResizeObserver){observer=new root.ResizeObserver(schedule);observer.observe(img);if(work)observer.observe(work);}
 update();
}

function mobileManufacturerBadge(card,j,v){
 if(!card.matches('.mobileJob'))return;
 const top=card.querySelector('.mobileJobTop'),plate=top?.querySelector('.ukPlate');if(!plate)return;const anchor=plate.closest('.plannerPlateWrap')||plate;
 const brand=root.VectaVehicleImage?.manufacturer?.(v?.make||j.make||j.vehicle);if(!brand)return;
 let badge=top.querySelector('.mobileManufacturerBadge');if(!badge){badge=document.createElement('img');badge.className='mobileManufacturerBadge';anchor.after(badge);}
 badge.src='/assets/manufacturers/'+brand+'.svg';badge.alt=(v?.make||j.make||brand)+' logo';
 const height=plate.getBoundingClientRect?.().height||30;badge.style.height=height+'px';badge.style.width=(height*1.8)+'px';badge.onerror=()=>badge.remove();
}
function genericDashboardArtwork(card,target,j){const previous=card.querySelector('.haynesDashboardImage');if(image(previous?.dataset?.haynesSource)&&reg(previous.dataset.registration)===reg(j.registration))return;
 const svg=root.VectaFleetImages?.artwork?.(j.model||j.vehicle||j.make,dashboardColour(j));if(!svg)return;
 let img=card.querySelector('.haynesDashboardImage');if(!img){img=document.createElement('img');img.className='haynesDashboardImage';target.appendChild(img);}
 delete img.dataset.vehicleSource;delete img.dataset.personalised;delete img.dataset.personalising;delete img.dataset.haynesSource;delete img.dataset.vehicleImage;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);img.alt='Generic '+(j.vehicle||j.model||j.make||'vehicle')+' illustration';img.dataset.generic='true';img.dataset.registration=reg(j.registration);if(j.fleet_vehicle_id)img.dataset.fleetArtworkId=String(j.fleet_vehicle_id);img.title='Click to choose vehicle image and colour';target.classList.add('hasHaynesDashboardImage');mobileManufacturerBadge(card,j);trackTimedArtwork(card,img);
}
root.enrichHaynesDashboard=function(container,jobs){
 if(!container)return;const byId=new Map((jobs||[]).filter(j=>!j.no_vehicle&&j.card_type!=='mini_task').map(j=>[String(j.id),j]));
 const sharedLoad=hydrateSharedArtwork();
 if(sharedLoad){const refresh=sharedRefresh.get(container);if(refresh)refresh.jobs=jobs;else{const next={jobs};sharedRefresh.set(container,next);sharedLoad.then(()=>{sharedRefresh.delete(container);if(container.isConnected)root.enrichHaynesDashboard(container,next.jobs);}).catch(()=>sharedRefresh.delete(container));}}
 dashboardObservers.get(container)?.disconnect();
 let observer;if(root.IntersectionObserver){observer=new root.IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))root.enrichHaynesDashboard(container,jobs);});dashboardObservers.set(container,observer);}
 const groups=new Map();
 for(const card of container.querySelectorAll('.job:not(.miniPlannerTask)[data-job-id],.mobileJob[data-open-job],.unallocatedSideJob[data-open-unallocated],.quoteCard[data-open-job],.requestCard[data-request-id]')){
  const j=byId.get(card.dataset.jobId||card.dataset.openJob||card.dataset.openUnallocated||card.dataset.requestId),target=card.matches('.mobileJob,.unallocatedSideJob')?card:card.querySelector(card.matches('.requestCard')?'.requestVehicleArtwork':'.plannerJobHeader');if(!j||!target)continue;
  const key=reg(j.registration)+'|'+make(j.make)+'|'+words(j.model||j.vehicle)+'|'+words(dashboardColour(j))+'|'+String(j.fleet_vehicle_id||j.vehicle_id||'');if(!groups.has(key))groups.set(key,{job:j,targets:[]});groups.get(key).targets.push({card,target});
 }
const attach=(v,targets,j)=>{for(const {card,target} of targets){if(!card.isConnected)continue;if(!v){genericDashboardArtwork(card,target,j);continue;}const internal=root.VectaFleetImages?.forJob?.(j),colour=internal?.vehicle?.colour||dashboardColour(j);if(!v.manual&&!internal)rememberArtwork({registration:j.registration,make:v.make,model:v.model,imageUrl:v.imageUrl,colour,...(v.generic?{generic:true}:{})});let img=card.querySelector('.haynesDashboardImage');if(img&&(img.dataset.haynesSource!==v.imageUrl||img.dataset.colour!==colour)){img.remove();img=null;}img=img||thumbnail(v,'haynesDashboardImage',j);if(img){img.dataset.haynesSource=v.imageUrl;img.dataset.colour=colour;img.dataset.vehicleName=[v.make,v.model].join(' ');img.setAttribute('data-vehicle-image','');img.dataset.registration=reg(j.registration);img.dataset.vehicleLogo='separate';img.dataset.vehicleCrop='tight';target.appendChild(img);mobileManufacturerBadge(card,j,v);img.addEventListener('error',()=>genericDashboardArtwork(card,target,j),{once:true});target.classList.add('hasHaynesDashboardImage');trackTimedArtwork(card,img);root.VectaVehicleImage?.mount(target);}}};
 // Calendar rendering reads stored artwork only; it must never enqueue the PC worker.
 for(const group of groups.values()){
  const j=group.job,hit=identitySnapshot(j.registration,j.make,j.model||j.vehicle)||snapshot(j.registration,j.make,j.model||j.vehicle),fallback=artworkSnapshot(j.registration,j.make,j.model||j.vehicle)||genericImage(j);
  const internal=root.VectaFleetImages?.forJob?.(j);attach(storedDrawing(j),group.targets,j);
  for(const {card} of group.targets){const img=card.querySelector('.haynesDashboardImage');if(img?.dataset){if(internal){img.dataset.fleetArtworkId=String(internal.vehicle.id);img.title='Click to choose vehicle image and colour';img.style.cursor='pointer';}else{delete img.dataset.fleetArtworkId;img.style.cursor='';}}}
  if(!internal?.drawing?.imageUrl&&!hit?.imageUrl&&!fallback?.imageUrl){const refresh=hydrateSharedArtwork({refresh:true});if(refresh&&!sharedRefresh.has(container)){sharedRefresh.set(container,{jobs});refresh.then(ok=>{sharedRefresh.delete(container);if(ok&&container.isConnected)root.enrichHaynesDashboard(container,jobs);}).catch(()=>sharedRefresh.delete(container));}}
 }

};
root.invoiceVehiclePresentation=function(invoice){
 const v=storedDrawing(invoice);
 const linked=(root.app?.jobs||[]).find(j=>String(j.id)===String(invoice.job_id));
 return {imageUrl:v?.imageUrl||'',colour:dashboardColour(Object.assign({},linked||{},invoice))};
};
root.enrichHaynesInvoice=function(sheet,invoice){
 const strip=sheet?.querySelector('.invoiceBookingHeader');if(!strip||!invoice||sheet.querySelector('.haynesInvoiceImage'))return;
 const matched=identitySnapshot(invoice.registration,invoice.make)||snapshot(invoice.registration,invoice.make),v=storedDrawing(invoice);if(!v)return;const img=thumbnail(v,'haynesInvoiceImage');if(img){
  const header=sheet.querySelector('.invoiceBookingArtwork');
  if(header){
   const picture=document.createElement('div');picture.className='haynesInvoiceHeaderVehicle';
   const linked=(root.app?.jobs||[]).find(j=>String(j.id)===String(invoice.job_id));
   const vehicle=Object.assign({},linked||{},invoice,{registration:invoice.registration||linked?.registration});
   img.setAttribute('data-vehicle-image','');img.dataset.vehicleLogo='separate';img.dataset.vehicleCrop='tight';img.dataset.registration=reg(vehicle.registration);
   img.dataset.colour=dashboardColour(vehicle);img.dataset.vehicleName=[v.make,v.model].join(' ');
   picture.appendChild(img);header.appendChild(picture);
   sheet.invoiceVehicleReady=root.VectaVehicleImage?.mount(picture);
  }
 }

 if(matched){const title=strip.querySelector('.invoiceVehicleMake,.invoiceBookingDetails>strong');if(title)title.textContent=[matched.make,matched.model,matched.variant].filter(Boolean).join(' ');}
};
root.initHaynesJobTools=function(modal){
 modal?.classList.remove('registrationBooking');
 const section=modal?.querySelector('.jobVehicleSection'),input=modal?.querySelector('#job_registration');
 if(!section||!input||modal.querySelector('.haynesJobTools'))return;
 const header=modal.querySelector('.jobModalHead');
 const mechanic=root.VECTA_MECHANIC_DEPLOYMENT===true;
 modal.querySelector('.jobModalCard')?.classList.toggle('mechanicJobCard',mechanic);
 modal.querySelector('.jobModalCard')?.classList.add('jobCardSimplified');
 const heading=document.createElement('div');heading.className='jobCardHeaderHeading';
 const plate=document.createElement('div');plate.className='jobCardHeaderRegistration';plate.setAttribute('aria-label','Vehicle registration');
 const vehicleTitle=document.createElement('strong');vehicleTitle.className='jobCardHeaderModel';
 if(header){
  const title=header.querySelector('h2');header.insertBefore(heading,title);if(title)heading.appendChild(title);
  const oldField=input.closest('.field'),registrationControl=input.closest('.plateInputWrap')||input;
  input.setAttribute('aria-label','Vehicle registration');plate.appendChild(registrationControl);heading.appendChild(plate);heading.appendChild(vehicleTitle);
  if(oldField)oldField.remove();heading.appendChild(section);header.classList.add('hasHeaderVehicleDetails');
 }
 const picture=document.createElement('div');picture.className='jobCardHeaderVehicle';
 if(header){header.classList.add('hasJobCardVehicle');header.insertBefore(picture,header.querySelector('.jobModalHeadActions'));}
 if(header){
  const details=document.createElement('div');details.className='jobCardHeaderDetails';
  details.appendChild(section);header.appendChild(details);header.classList.add('jobCardPinnedHeader');
  // Independent columns prevent short history/parts panels from reserving tall rows.
  const sections=modal.querySelector('.jobCardSections');
  if(sections){
   const main=document.createElement('div'),aside=document.createElement('div');
   main.className='jobCardMainColumn';aside.className='jobCardSupportColumn';
   Array.from(sections.children).forEach(child=>{
    const support=child.matches('.jobContactSection,.jobPreviousWorkSection,.privatePricingSection')||!!child.querySelector('.jobPartsEditor');
    (support?aside:main).appendChild(child);
   });
   const contact=aside.querySelector('.jobContactSection');if(contact)details.appendChild(contact);
   if(contact){
    const field=document.createElement('div');field.className='field jobCurrentMileageField';
    const label=document.createElement('label');label.htmlFor='job_current_mileage';label.textContent='Enter current mileage';
    const mileageInput=document.createElement('input');mileageInput.id='job_current_mileage';mileageInput.type='text';mileageInput.inputMode='numeric';mileageInput.autocomplete='off';mileageInput.placeholder='';mileageInput.setAttribute('aria-label','Enter current mileage');mileageInput.setAttribute('aria-required',String(typeof root.currentJobMileageRequired==='function'?root.currentJobMileageRequired({job_type:modal.querySelector('#job_job_type')?.value}):true));
    const note=modal.querySelector('#job_customer_note')?.value||'';const saved=note.match(/\[\[VECTA_CURRENT_MILEAGE:(\d+)\]\]/);mileageInput.value=saved?saved[1]:'';if(!saved&&/\[\[VECTA_CURRENT_MILEAGE_UNKNOWN\]\]/.test(note)){mileageInput.dataset.mileageUnknown='true';mileageInput.placeholder='Mileage unknown';}
    const noVehicle=modal.querySelector('#job_no_vehicle');const toggleMileage=()=>{field.hidden=!!noVehicle?.checked;mileageInput.disabled=field.hidden;};toggleMileage();noVehicle?.addEventListener('change',toggleMileage);
    mileageInput.addEventListener('input',()=>{delete mileageInput.dataset.mileageUnknown;mileageInput.placeholder='';mileageInput.classList.remove('requiredMissing');mileageInput.removeAttribute('aria-invalid');});
    field.append(label,mileageInput);contact.after(field);
   }
   sections.append(main,aside);
   const parts=aside.querySelector('.jobPartsEditor')?.closest('.jobFormSection'),pricing=aside.querySelector('.privatePricingSection');
   if(parts)main.appendChild(parts);
   if(pricing)main.appendChild(pricing);
   const previous=aside.querySelector('.jobPreviousWorkSection');
   const booking=main.querySelector('.jobBookingSection');if(booking){
    booking.classList.add('jobBookingFullWidth');sections.prepend(booking);if(previous){previous.classList.add('jobPreviousWorkAlongside');aside.prepend(previous);}
    const calendar=booking.querySelector('.bookingAvailabilityWorkspace');if(calendar)aside.appendChild(calendar);
   }
  }
 }

 function showHeaderVehicle(drawing){
  picture.replaceChildren();picture.hidden=!!modal.querySelector('#job_no_vehicle')?.checked;
  const value=reg(input.value);plate.hidden=picture.hidden;vehicleTitle.hidden=picture.hidden;if(picture.hidden)return;
  const registration=reg(input.value),linked=(root.app?.jobs||[]).find(j=>String(j.id)===String(root.editingJobId)),description={...linked,registration,make:modal.querySelector('#job_make')?.value,model:modal.querySelector('#job_model')?.value,vehicle:modal.querySelector('#job_vehicle')?.value};
  const colour=dashboardColour(description),name=[description.make,description.model||description.vehicle].filter(Boolean).join(' ');
  picture.dataset.vehiclePicker='';picture.dataset.registration=registration;if(description.fleet_vehicle_id)picture.dataset.fleetArtworkId=String(description.fleet_vehicle_id);
  const fallback=()=>{picture.innerHTML=root.VectaFleetImages?.artwork?.(name,colour)||'';picture.title='Generic vehicle illustration — appearance may differ';};
  const v=drawing||storedDrawing(description),src=image(v?.imageUrl);
  const manufacturer=String(description.make||v?.make||'').trim(),model=String(description.model||description.vehicle||v?.model||'').trim();
  vehicleTitle.textContent=manufacturer&&model&&!model.toUpperCase().startsWith(manufacturer.toUpperCase()+' ')&&model.toUpperCase()!==manufacturer.toUpperCase()?manufacturer+' '+model:model||manufacturer;
  if(!src){fallback();return;}
  const img=document.createElement('img');artworkSource(img,src,description,colour);if(description.fleet_vehicle_id)img.dataset.fleetArtworkId=String(description.fleet_vehicle_id);img.alt=[colour,v.make,v.model,registration].filter(Boolean).join(' ');img.dataset.vehicleImage='';img.dataset.registration=registration;img.dataset.colour=colour;img.dataset.vehicleName=name;img.dataset.vehicleMake=v.make||'';img.dataset.vehicleLogo='separate';img.dataset.vehicleCrop='tight';img.onerror=()=>{img.title='Saved vehicle image is temporarily unavailable. It has been retained.';};picture.appendChild(img);picture.title='';root.VectaVehicleImage?.mount(picture);
 }
 const panel=document.createElement('div');panel.className='haynesJobTools';
 panel.innerHTML='<button type="button" class="btn">Haynes Pro</button><span role="status" aria-live="polite"></span><div class="haynesJobVehicle"></div>';
 if(mechanic&&header)header.appendChild(panel);else section.appendChild(panel);
 const button=panel.querySelector('button'),status=panel.querySelector('[role="status"]'),body=panel.querySelector('.haynesJobVehicle'),noVehicle=modal.querySelector('#job_no_vehicle');
 // Keep the original controls and handlers while arranging the compact header.
 const vehicleField=section.querySelector('#job_vehicle')?.closest('.field');if(vehicleField)vehicleField.hidden=true;
 const due=section.querySelector('#jobVehicleDuePanel'),mileage=section.querySelector('#job_mileage')?.closest('.field');
 if(mileage){
  const facts=document.createElement('div');facts.className='jobVehicleQuickFacts';
  const mileageLabel=mileage.querySelector('label');if(mileageLabel)mileageLabel.textContent='Last MOT mileage';
  if(due){due.before(facts);facts.appendChild(due);}else mileage.before(facts);
  facts.appendChild(mileage);
  const currentMileage=modal.querySelector('.jobCurrentMileageField');if(currentMileage)facts.appendChild(currentMileage);
  // Facts align with the customer details in the left header column.
  if(header)header.appendChild(facts);
 }
 if(header){
  let actions=header.querySelector('.jobModalHeadActions');
  if(!actions){actions=document.createElement('div');actions.className='jobModalHeadActions';}
  button.classList.add('jobHeaderHaynesLookup');
  const lookupRow=document.createElement('div');lookupRow.className='jobHeaderHaynesRow';lookupRow.appendChild(button);heading.appendChild(lookupRow);
  actions.querySelector('[data-close-modal]')?.remove();
  const print=actions.querySelector('#printJobCard'),foot=modal.querySelector('.modalFoot'),remove=foot?.querySelector('#deleteJob');
  if(print&&foot){print.classList.remove('jobPrintSmall');if(remove)remove.after(print);else foot.prepend(print);}
  actions.classList.add('jobCardTopActions');header.prepend(actions);
  section.querySelector('.jobFormSectionHead')?.remove();
 }

 let sequence=0,refreshTimer;
 function showGeneric(){if(noVehicle?.checked)return;const v=genericImage({make:modal.querySelector('#job_make')?.value,model:modal.querySelector('#job_model')?.value,vehicle:modal.querySelector('#job_vehicle')?.value}),img=thumbnail(v,'haynesJobGenericImage',{registration:current()});if(img){body.replaceChildren(img);return true;}return false;}
 const current=()=>reg(input.value);
 function clear(){
  const noVehicleControl=noVehicle?.closest('.noVehicleToggle')||noVehicle;
  if(noVehicleControl){const selected=!!current()||!!String(modal.querySelector('#job_vehicle')?.value||'').trim().replace(/^No Vehicle$/i,'');noVehicleControl.hidden=selected&&!noVehicle.checked;}
  showHeaderVehicle();sequence++;clearTimeout(refreshTimer);body.replaceChildren();status.textContent='';button.disabled=!!noVehicle?.checked;button.textContent='Haynes Pro';showGeneric();}
 function changed(){clear();}
 const shared=hydrateSharedArtwork();if(shared)shared.then(()=>{if(modal.isConnected)showHeaderVehicle();});
 input.addEventListener('input',changed);input.addEventListener('change',changed);for(const selector of ['#job_vehicle','#job_model','#job_make']){const field=modal.querySelector(selector);field?.addEventListener('change',changed);}noVehicle?.addEventListener('change',changed);clear();
 button.onclick=async(event)=>{
  if(!panel.isConnected)return;clear();if(event){failed.delete(current());}
const requested=current(),expectedMake=make(modal.querySelector('#job_make')?.value);
  if(noVehicle?.checked||!lookupRegistration(requested)){status.textContent='Enter the actual vehicle registration first. Placeholder names cannot be looked up.';return;}
  // Open during the click so browsers do not block the eventual vehicle page.
  const target=event&&typeof root.open==='function'?root.open('about:blank','_blank'):null;
  if(target)target.opener=null;
  const run=sequence;
  button.disabled=true;status.textContent='Looking up vehicle…';
  try{
   const v=await lookup(requested,expectedMake,{force:!!event});
   if(run!==sequence||!panel.isConnected||current()!==requested||noVehicle?.checked){target?.close();return;}
   if(!v||reg(v?.registration)!==requested||!v?.model||!v?.variant||!v?.make||!vehicleLink(v)||(expectedMake&&make(v.make)!==expectedMake))throw Error('UNAVAILABLE');
   if(target)target.location.replace(vehicleLink(v));
   remember(v);showHeaderVehicle(v);const link=document.createElement('a');link.className='btn dark';link.href=vehicleLink(v);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open this vehicle in HaynesPro';
   const details=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('small');
   title.textContent=[v.make,v.model,v.variant].join(' ');note.textContent=[v.engineCode,v.modelYears].filter(Boolean).join(' · ');details.append(title,note);
   body.replaceChildren();const src=image(v.imageUrl);if(src){const img=document.createElement('img');img.src=artworkUrl(src);img.alt=(v.generic?'Generic model image: ':'Representative ')+v.make+' '+v.model;img.title=v.generic?'Generic model image — appearance may differ':img.alt;img.dataset.generic=String(!!v.generic);img.dataset.vehicleMake=v.make||'';img.dataset.registration=requested;img.dataset.vehicleName=[v.make,v.model].join(' ');img.onerror=()=>img.remove();body.appendChild(img);}
   const times=document.createElement('a');times.className='btn';times.href='https://www.workshopdata.com/touch/site/layout/repairTimes?typeId='+encodeURIComponent(v.typeId)+'&groupId=QUICKGUIDES';times.target='_blank';times.rel='noopener noreferrer';times.textContent='Repair times';
   if(!src)showGeneric();body.append(details,link,times);status.textContent='Matched vehicle — check the variant before using technical data.';button.textContent='Haynes Pro';
  }catch{target?.close();if(run===sequence&&panel.isConnected&&current()===requested)button.textContent='Haynes Pro';if(run===sequence&&panel.isConnected&&current()===requested)status.textContent=({NOT_CONFIGURED:'HaynesPro lookup is not configured for this preview.',OFFLINE:'The workshop HaynesPro worker is offline.',LOGIN_REQUIRED:'The workshop HaynesPro login needs renewing.',VERIFICATION_REQUIRED:'HaynesPro needs verification on the workshop PC.',BUSY:'HaynesPro is busy. Try again shortly.',DAILY_LIMIT:'The daily HaynesPro lookup limit has been reached.'}[failStatus.get(requested)]||'HaynesPro unavailable or vehicle match uncertain.')+' You can still save this job.';}
  finally{if(run===sequence)button.disabled=!!noVehicle?.checked;}
 };
 if(!noVehicle?.checked&&identitySnapshot(current()))button.onclick();
};
document.addEventListener('DOMContentLoaded',()=>{if(root.view==='planner')root.enrichHaynesDashboard(document.getElementById('content'),root.app?.jobs);});
function storedArtwork(){const unique=new Map();for(const v of [...sharedArtwork.values(),...artwork.values(),...identities.values(),...cache.values()])if(image(v.imageUrl))unique.set(v.imageUrl,{make:v.make,model:v.model,imageUrl:v.imageUrl});return [...unique.values()].sort((a,b)=>[a.make,a.model].join(" ").localeCompare([b.make,b.model].join(" ")));}
// Explicit choices are artwork only: never modify technical vehicle identity.
async function saveManualArtwork(value){
 const clean=cleanArtwork({...value,manual:true});if(!clean)throw Error('Choose a stored image for a vehicle with a registration.');
 const client=workshopClient();if(!client||root.VECTA_AUDIT_PREVIEW)throw Error('Connect to Workshop Pro before saving the image.');
 if(sharedSaving)await sharedSaving;
 const response=await sharedArtworkResponse(client.from('workshop_settings').upsert({id:SHARED_ART_PREFIX+clean.registration,value:clean,updated_at:new Date().toISOString()},{onConflict:'id'}));
 if(response.error)throw Error('Image could not be saved. Please retry.');
 sharedWrites.delete(clean.registration);sharedArtwork.set(clean.registration,clean);rememberArtwork(clean,false,{replace:true});
 try{root.localStorage?.setItem(ART_KEY,JSON.stringify([...artwork.values()]));}catch{}
 return clean;
}
root.VectaHaynesJobTools={trackTimedArtwork,saveManualArtwork,compatibleArtwork,storedDrawing,artworkUrl,storedArtwork,vehicleLink,safeImage:image,remember,snapshot,artworkSnapshot,lookup,lookupNeedsRetry:registration=>failed.has(reg(registration)),lookupStatus:registration=>failStatus.get(reg(registration))||'UNAVAILABLE',genericImage,dashboardColour,lookupDashboardColour,rememberLookupColour,hydrateSharedArtwork,flushSharedArtwork};
})(window);

/* Dashboard registration lookup: read-only until a job/quote form is saved. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalise=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const messages={UNAVAILABLE:'HaynesPro could not complete this lookup. Please retry shortly.',SERVICE_TIMEOUT:'The service request timed out. Check the workshop worker and retry.',TimeoutError:'The connection timed out. Please retry.',OFFLINE:'The workshop HaynesPro worker is offline.',LOGIN_REQUIRED:'Renew the HaynesPro login on the workshop PC.',VERIFICATION_REQUIRED:'HaynesPro needs verification on the workshop PC.',NOT_CONFIGURED:'HaynesPro is not configured.',BUSY:'HaynesPro is busy. Please retry.',DAILY_LIMIT:'The workshop’s internal daily lookup allowance has been reached. Cached vehicles may still be available.',AMBIGUOUS:'HaynesPro could not identify a unique vehicle.',SCHEDULE_REQUIRED:'Select a service schedule in HaynesPro.',WORKER_UPDATE_REQUIRED:'The workshop HaynesPro worker needs updating.'};
let active=null;
async function openTechnical(registration,bookingContext){
 const reg=normalise(registration);if(!/^[A-Z0-9]{2,8}$/.test(reg))return;
 active?.abort();const controller=new AbortController();active=controller;
 document.getElementById('haynesLookupPage')?.remove();
 const page=document.createElement('dialog');page.id='haynesLookupPage';page.className='haynesLookupPage';
 page.innerHTML='<header><div><small>VEHICLE LOOKUP</small><h2>'+esc(reg)+'</h2></div><button type="button" data-close aria-label="Close vehicle lookup">Close</button></header><p role="status" data-status>Looking up vehicle in HaynesPro…</p><section data-identity></section><div class="haynesLookupMot"><b>Mileage at last MOT</b><strong data-mot-mileage>Loading…</strong><small data-mot-date></small></div><form data-schedule-form><label>Current mileage <input name="mileage" type="number" min="1" max="2000000" step="1" required></label><label>Maintenance schedule <select name="system"><option value="">Automatic where unambiguous</option></select></label><label>Service type / interval <select name="period"><option value="">Automatic from mileage</option></select></label><button type="submit">Load service data</button></form><section data-service></section><footer><button type="button" data-create="quote" disabled>Create Quote</button><button type="button" data-create="job" disabled>Create Job</button></footer>';
 document.body.appendChild(page);page.showModal();if(bookingContext)page.querySelector('footer')?.remove();
 const status=page.querySelector('[data-status]'),identity=page.querySelector('[data-identity]'),service=page.querySelector('[data-service]'),form=page.querySelector('form');let vehicle=null,government=null,serviceRun=0,guidedFlow=true,menuChoices=[];
 const close=()=>{controller.abort();page.remove();document.getElementById('haynesDashboardRegistration')?.focus();};page.querySelector('[data-close]').onclick=close;page.addEventListener('cancel',e=>{e.preventDefault();close();});
 const isCurrent=()=>!controller.signal.aborted&&page.isConnected;
 async function json(url){const requestController=new AbortController(),abort=()=>requestController.abort();controller.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);try{const r=await root.fetch(url,{cache:'no-store',signal:requestController.signal});const d=await r.json();if(!r.ok)throw Error(d.status||d.error||'UNAVAILABLE');return d;}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}}
 form.onsubmit=async e=>{e.preventDefault();const mileage=Number(form.elements.mileage.value);if(!Number.isSafeInteger(mileage)||mileage<=0||mileage>2000000)return;const run=++serviceRun;service.textContent='Loading service schedule…';const selected=form.elements.period.value||'',query=new URLSearchParams({haynes:'service',reg,mileage:String(mileage),period:guidedFlow?'':selected,system:guidedFlow?'':form.elements.system.value||'',scheduleMode:'choose',menuFlow:guidedFlow?'guided':'',menuChoices:JSON.stringify(menuChoices)});let id='';try{const until=Date.now()+95000;let d;do{if(id)query.set('id',id);d=await json('/api/availability?'+query);if(!isCurrent()||run!==serviceRun||Number(form.elements.mileage.value)!==mileage)return;if(d.status!=='PENDING')break;id=d.id||id;await new Promise(resolve=>setTimeout(resolve,1000));}while(Date.now()<until);if(d.status==='PENDING')throw Error('SERVICE_TIMEOUT');if(d.status!=='MATCHED')throw Error(d.status);const result=d.result;if(normalise(result?.vehicle?.registration)!==reg||result.mileage!==mileage)throw Error('MISMATCH');showMatchedVehicle(result.vehicle);status.textContent='Vehicle matched. Follow the service schedule choices below.';guidedFlow=result.menuFlow==='guided';
 if(result.kind==='manual_step'){service.textContent=result.message;return;}
 if(result.kind==='menu_choice') {
  const repeatedNormal=menuChoices.some(c=>c.menu===result.menu.id);
  menuChoices=menuChoices.slice(0,result.resetFrom);
  const normal=result.menu.options.filter(o=>/^Normal conditions(?:\s*\(United Kingdom\))?$/i.test(o.label.trim()));
  if(normal.length===1&&!repeatedNormal){menuChoices.push({menu:result.menu.id,option:normal[0].id});form.elements.system.value='';form.elements.period.value='';return form.onsubmit({preventDefault(){}});}
  form.elements.system.closest('label').hidden=true;form.elements.period.closest('label').hidden=true;
  service.innerHTML='<label>'+esc(result.menu.label)+'<select data-next-menu aria-label="'+esc(result.menu.label)+'"><option value="">Choose an option…</option>'+result.menu.options.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.label)+'</option>').join('')+'</select></label><p>Select an option to continue the Haynes service lookup.</p>';
  service.querySelector('[data-next-menu]').onchange=e=>{if(!e.target.value)return;menuChoices.push({menu:result.menu.id,option:e.target.value});form.elements.system.value='';form.elements.period.value='';return form.onsubmit({preventDefault(){}});};return;
 }
 if(result.menuFlow==='guided') {
  form.elements.system.closest('label').hidden=true;form.elements.period.closest('label').hidden=true;
 }
 const systemSelect=form.elements.system,systems=result.schedules||[];
 systemSelect.innerHTML='<option value="">Choose the schedule for this vehicle…</option>'+systems.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===result.system?' selected':'')+'>'+esc(s.label)+'</option>').join('');
 systemSelect.onchange=()=>{form.elements.period.value='';return form.onsubmit({preventDefault(){}});};
 if(result.kind==='schedule_choices'){service.textContent='Choose the maintenance schedule above. Check the year range and fixed or Longlife servicing.';form.elements.period.innerHTML='<option value="">Choose a schedule first</option>';return;}
 if(query.get('system')&&query.get('system')!==result.system)throw Error('MISMATCH');
 if(result.kind==='period_choices') {
  form.elements.period.innerHTML='<option value="">Choose the service type…</option>'+result.periods.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.label)+'</option>').join('');
  form.elements.period.onchange=()=>form.onsubmit({preventDefault(){}});
  service.textContent='Choose the service type above, such as oil service, inspection, or the combined service.';return;
 }
 form.elements.period.innerHTML='<option value="">Automatic from mileage</option>'+(result.periods||[]).map(p=>'<option value="'+esc(p.id)+'"'+(p.id===selected?' selected':'')+'>'+esc(p.label)+'</option>').join('');const list=(title,items)=>'<article><h3>'+title+'</h3>'+(items?.length?'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>No items returned.</p>')+'</article>';service.innerHTML='<h3>'+esc(result.schedule)+'</h3><p>'+esc(result.conditions)+'</p><div class="haynesLookupSections"><article><h3>Engine oil</h3>'+(result.oil||[]).map(x=>'<p><b>'+esc(x.applicability)+'</b><br>'+esc(x.specification)+'<br>'+esc(x.capacity)+'</p>').join('')+'</article>'+list('Scheduled parts and filters',result.parts)+list('Additional work',result.additional)+'</div><small>HaynesPro · '+esc(result.fetchedAt)+' · Check replacement history before authorising work.</small>';if(result.menuFlow==='guided'){const reset=document.createElement('button');reset.type='button';reset.textContent='Change Haynes choices';reset.onclick=()=>{menuChoices=[];form.elements.period.value='';form.elements.system.value='';form.onsubmit({preventDefault(){}});};service.appendChild(reset);}}catch(err){if(isCurrent()&&run===serviceRun)service.textContent=messages[err.message]||'Service data unavailable. Please retry shortly.';}};
 form.querySelector('[name="mileage"]')?.addEventListener?.('input',()=>{serviceRun++;menuChoices=[];service.textContent='Mileage changed. Load service data again.';});
 page.querySelectorAll('[data-create]').forEach(button=>button.onclick=()=>{if(!vehicle)return;const preset={registration:reg,make:vehicle.make,model:vehicle.model,vehicle:[vehicle.make,vehicle.model].join(' '),mileage:Number(form.elements.mileage.value)||null,engine_code:vehicle.engineCode||'',technician:'Unallocated',status:button.dataset.create==='quote'?'quote':'booked',mot_due:government?.motDueDate||null,tax_due:government?.taxDueDate||null,vehicle_colour:government?.primaryColour||''};close();root.openJobModal(null,preset);});
 function paintLookupVehicle(){let img=identity.querySelector('img');if(!isCurrent()||!vehicle||!img||!root.VectaVehicleImage)return;const colour=root.VectaVehicleImage.resolveColour(reg,government?.primaryColour||root.VectaHaynesJobTools.dashboardColour?.({registration:reg,make:vehicle.make})||'');
 // Replace the old render when colour arrives: an in-flight renderer must not
 // overwrite the newer drawing, and a completed data URL is not a source SVG.
 if(img.dataset.colour!==colour&&img.dataset.personalising){const next=document.createElement('img');next.src=img.dataset.vehicleSource||root.VectaHaynesJobTools.safeImage(vehicle.imageUrl);next.alt=img.alt;next.onerror=()=>next.remove();img.replaceWith(next);img=next;}
 img.dataset.vehicleSource=root.VectaHaynesJobTools.safeImage(vehicle.imageUrl);img.dataset.registration=reg;img.dataset.colour=colour;img.dataset.vehicleName=vehicle.make+' '+vehicle.model;img.setAttribute('data-vehicle-image','');img.dataset.vehicleLogo='separate';img.dataset.vehicleCrop='tight';root.VectaVehicleImage.mount(identity);}
 function showMatchedVehicle(value){vehicle=root.VectaHaynesJobTools.remember(value);if(!vehicle)throw Error('MISMATCH');identity.innerHTML='<div><h2>'+esc(vehicle.make+' '+vehicle.model)+'</h2><p>'+esc(vehicle.variant)+'</p><dl>'+[['Engine code',vehicle.engineCode],['Model years',vehicle.modelYears]].map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v||'Not supplied')+'</dd>').join('')+'</dl><a target="_blank" rel="noopener noreferrer" href="'+esc(root.VectaHaynesJobTools.vehicleLink(vehicle))+'">Open full HaynesPro vehicle data</a></div>';
 const src=root.VectaHaynesJobTools.safeImage(vehicle.imageUrl);if(src){const img=document.createElement('img');img.dataset.vehicleSource=src;img.src=root.VectaHaynesJobTools.artworkUrl?.(src)||src;img.alt=vehicle.make+' '+vehicle.model;img.onerror=()=>img.remove();identity.append(img);}paintLookupVehicle();status.textContent='Vehicle matched. Enter the current mileage to load its service schedule.';page.querySelectorAll('[data-create]').forEach(b=>b.disabled=false);}
 const motLookup=(async()=>{
 try{government=await json('/api/vehicle-lookup?reg='+encodeURIComponent(reg));if(normalise(government.registration)!==reg)government=null;else root.VectaHaynesJobTools.rememberLookupColour?.(government);const raw=String(government?.latestMileage??'').replace(/[, ]/g,''),available=/^\d+$/.test(raw),unit=String(government?.latestMileageUnit||'').toLowerCase();if(isCurrent()){paintLookupVehicle();page.querySelector('[data-mot-mileage]').textContent=available?Number(raw).toLocaleString('en-GB')+' '+(unit==='mi'?'miles':unit==='km'?'km':unit||'units'):'Not available';page.querySelector('[data-mot-date]').textContent=(government?.lastMotTestDate?'MOT date: '+String(government.lastMotTestDate).slice(0,10).split('-').reverse().join('/')+'. ':'')+'Historical MOT reading; enter current mileage separately.';}}catch{if(isCurrent())page.querySelector('[data-mot-mileage]').textContent='Not available';}
 })();
 try{const matched=await root.VectaHaynesJobTools.lookup(reg,undefined,{background:false,force:root.VectaHaynesJobTools.lookupNeedsRetry?.(reg)||false});const d=matched?{status:'MATCHED',vehicle:matched}:{status:root.VectaHaynesJobTools.lookupStatus(reg)};if(!isCurrent())return;if(d.status!=='MATCHED'||normalise(d.vehicle?.registration)!==reg)throw Error(d.status);vehicle=root.VectaHaynesJobTools.remember(d.vehicle);if(!vehicle)throw Error('MISMATCH');showMatchedVehicle(d.vehicle);

 }catch(err){if(isCurrent()&&!vehicle)status.textContent=messages[err.message]||'Vehicle match unavailable. Check the registration and retry.';}
 await motLookup;
}
function openBooking(registration){
 const value=String(registration||'').trim(),key=normalise(value);if(!key)return;
 const stored=root.VectaBookingVehicles?.resolve(value);
 if(!stored&&!/^[A-Z0-9]{2,8}$/.test(key))return;
 active?.abort();active=new AbortController();
 const preset={...(stored||{}),registration:stored?.registration||key,mileage:'',technician:'Unallocated',status:'booked'};
 root.openJobModal(null,preset);
 const modal=document.getElementById('jobModal'),header=modal?.querySelector('.jobModalHead'),body=modal?.querySelector('.jobModalBody');
 if(!header||!body)return;
 // Use the standard editor exactly as opened: no alternate layout, image sizing,
 // duplicate identity block, extra actions, or moved vehicle fields.
 const originalHeader=header;
 const field=id=>modal.querySelector('#job_'+id);
 const status=modal.querySelector('.haynesJobTools [role="status"]');
 const current=()=>modal.classList.contains('open')&&originalHeader.isConnected&&normalise(field('registration')?.value)===normalise(preset.registration);
 const setStatus=message=>{if(status&&current())status.textContent=message;};
 const dirty=new Set();['make','model','vehicle','colour'].forEach(id=>field(id)?.addEventListener('input',()=>dirty.add(id)));
 // Cached/local vehicles never cause a background Haynes or government lookup.
 if(stored)return;
 // New registrations need the government colour as well as the Haynes drawing.
 // The existing helper reuses saved colour and coalesces any pending request.
 Promise.resolve(root.VectaHaynesJobTools.hydrateSharedArtwork?.()).then(()=>{
  if(current())return root.VectaHaynesJobTools.lookupDashboardColour?.({registration:key,make:field('make')?.value||''});
 }).then(()=>{if(current())field('vehicle')?.dispatchEvent(new root.Event('change',{bubbles:true}));}).catch(()=>{});
 return (async()=>{
  try{
   const vehicle=await root.VectaHaynesJobTools.lookup(key,undefined,{background:false});
   if(!current())return;
   if(!vehicle||normalise(vehicle.registration)!==key)throw Error('UNAVAILABLE');
   root.VectaHaynesJobTools.remember(vehicle);
   for(const [id,v] of Object.entries({make:vehicle.make,model:vehicle.model,vehicle:[vehicle.make,vehicle.model].filter(Boolean).join(' ')}))if(field(id)&&!dirty.has(id)&&v)field(id).value=v;
   field('vehicle')?.dispatchEvent(new root.Event('change',{bubbles:true}));
   setStatus('Vehicle matched.');
  }catch{if(current())setStatus('Vehicle lookup unavailable. You can enter the details and save this booking.');}
 })();
}
function install(){const top=document.querySelector('.top'),search=top?.querySelector('.plannerGlobalSearchWrap');if(!search||document.getElementById('haynesDashboardLookup'))return;const form=document.createElement('form');form.id='haynesDashboardLookup';form.className='haynesDashboardLookup';form.setAttribute('aria-label','Start a booking for a saved or new vehicle');form.innerHTML='<span aria-hidden="true">GB</span><input id="haynesDashboardRegistration" aria-label="Vehicle registration for HaynesPro lookup" autocomplete="off" maxlength="60" list="bookingVehicleSuggestions" required><button type="submit" aria-label="Look up vehicle">⌕</button>';search.before(form);const suggestions=document.createElement('datalist');suggestions.id='bookingVehicleSuggestions';form.appendChild(suggestions);let suggestionTimer;const refreshSuggestions=()=>{const query=form.querySelector('input').value.trim();suggestions.innerHTML=query.length>=2?(root.VectaBookingVehicles?.suggestions(query,20)||[]).slice(0,20).map(v=>'<option value="'+esc(v.value)+'">'+esc(v.label)+'</option>').join(''):'';};form.querySelector('input').addEventListener('blur',()=>clearTimeout(suggestionTimer));form.onsubmit=e=>{e.preventDefault();const input=form.querySelector('input'),value=input.value.trim();if(!value)return;if(!root.VectaBookingVehicles?.resolve(value)&&!/^[A-Z0-9]{2,8}$/.test(normalise(value))){input.setCustomValidity('Select a saved vehicle or enter its registration.');form.reportValidity();return;}input.setCustomValidity('');openBooking(value);};form.querySelector('input').oninput=e=>{e.target.value=e.target.value.toUpperCase();e.target.setCustomValidity('');clearTimeout(suggestionTimer);suggestions.replaceChildren();if(e.target.value.trim().length>=2)suggestionTimer=setTimeout(refreshSuggestions,150);};}

root.VectaHaynesDashboardLookup={open:openBooking,openTechnical,install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);


