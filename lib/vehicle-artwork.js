import {databaseEnvironment} from '../api/_database-environment.js';
import {imageUrl,normaliseReg,validReg,vehicleMatches} from './haynes-vehicle.js';

// A public illustration lookup, separate from the PC/technical-data relay.
// Only fetch the requested registration, and never return customer or engine data.
export function createArtworkHandler({environment=databaseEnvironment,fetcher=fetch}={}) {
  // Share one small catalogue read across unknown registrations, not one full
  // workshop scan per customer. No jobs, contacts or technical data are read.
  const catalogues=new Map();
  async function modelCatalogue(env) {
    const cached=catalogues.get(env.url);
    if(cached&&Date.now()-cached.at<60000)return cached.promise;
    const headers={apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey};
    const promise=(async()=>{
      const response=await fetcher(env.url+'/rest/v1/workshop_settings?or=(id.like.vehicle_identity:*,id.like.vehicle_artwork:*)&select=id,value&order=updated_at.desc&limit=1000',{
        headers,signal:AbortSignal.timeout(4000)});
      if(!response.ok)throw Error('Catalogue unavailable');
      const rows=await response.json();
      return rows.sort((a,b)=>Number(b.id.startsWith('vehicle_identity:'))-Number(a.id.startsWith('vehicle_identity:')))
        .map(row=>row.value).filter(v=>!v?.manual&&v?.make&&v?.model&&/\.svgz?$/.test(imageUrl(v.imageUrl)))
        .map(v=>({make:String(v.make).slice(0,100),model:String(v.model).slice(0,180),imageUrl:imageUrl(v.imageUrl)}));
    })();
    catalogues.set(env.url,{at:Date.now(),promise});
    try{return await promise;}catch(error){catalogues.delete(env.url);throw error;}
  }
  return async function artwork(req,res) {
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET')return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
    if(['reg','make','model'].some(key=>Array.isArray(req.query?.[key])))return res.status(400).json({status:'INVALID_REQUEST'});
    const registration=normaliseReg(req.query?.reg),expected={make:String(req.query?.make||'').slice(0,100),model:String(req.query?.model||'').slice(0,180)};
    if(!validReg(registration)||!expected.make||!expected.model)return res.status(400).json({status:'INVALID_REQUEST'});
    try {
      const env=environment({requireService:true});
      const ids=['vehicle_artwork:','vehicle_identity:','vehicle_colour:'].map(prefix=>prefix+registration).join(',');
      const response=await fetcher(env.url+'/rest/v1/workshop_settings?id=in.('+ids+')&select=id,value',{
        headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey},signal:AbortSignal.timeout(4000)});
      if(!response.ok)throw Error('Artwork unavailable');
      const rows=await response.json(),values=new Map(rows.map(row=>[row.id,row.value]));
      const art=values.get('vehicle_artwork:'+registration),identity=values.get('vehicle_identity:'+registration),colour=values.get('vehicle_colour:'+registration);
      const candidates=art?.manual?[art,identity]:[identity,art];
      let chosen=candidates.find(v=>normaliseReg(v?.registration)===registration&&imageUrl(v?.imageUrl)&&vehicleMatches(v,expected));
      const generic=!chosen;
      if(!chosen)chosen=(await modelCatalogue(env)).find(v=>vehicleMatches(v,expected));
      if(!chosen)return res.status(200).json({status:'NOT_FOUND'});
      // A model donor supplies only the shape. Never inherit its registration,
      // colour, technical ID, engine or service information.
      const paint=art?.manual&&chosen===art?art.colour:(normaliseReg(colour?.registration)===registration&&vehicleMatches(colour,{make:expected.make})?colour.colour:'')||(!generic?chosen.colour:'');
      const vehicle={registration,make:String(chosen.make).slice(0,100),model:String(chosen.model).slice(0,180),imageUrl:imageUrl(chosen.imageUrl),
        ...(generic?{generic:true}:{}),...(chosen===art&&art.manual?{manual:true}:{}),...(typeof paint==='string'&&/^[A-Za-z]{3,12}$/.test(paint)?{colour:paint}:{}),source:'SavedArtwork'};
      return res.status(200).json({status:'ARTWORK',vehicle});
    }catch{return res.status(200).json({status:'UNAVAILABLE'});}
  };
}
export default createArtworkHandler();
