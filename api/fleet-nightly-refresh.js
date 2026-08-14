let tokenCache = { accessToken: '', expiresAt: 0 };

const FLEET_STATE_ID = 'fleet_state_v77';
const STATUS_ID = 'fleet_auto_refresh_status_v77';

function reg(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function isoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}
function daysFromNow(date) {
  if (!date) return Infinity;
  const target = Date.parse(String(date).slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(target)) return Infinity;
  return Math.floor((target - Date.now()) / 86400000);
}
function latestTest(tests) {
  return [...(tests || [])].sort((a,b)=>Date.parse(b?.completedDate||0)-Date.parse(a?.completedDate||0))[0] || null;
}
function latestPassedTest(tests) {
  return [...(tests || [])].filter(t=>String(t?.testResult||'').toUpperCase()==='PASSED')
    .sort((a,b)=>Date.parse(b?.completedDate||0)-Date.parse(a?.completedDate||0))[0] || null;
}
async function dvsaToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60000) return tokenCache.accessToken;
  const { DVSA_CLIENT_ID: client_id, DVSA_CLIENT_SECRET: client_secret, DVSA_SCOPE: scope, DVSA_TOKEN_URL: tokenUrl } = process.env;
  if (!client_id || !client_secret || !scope || !tokenUrl) throw new Error('DVSA credentials are not configured.');
  const response = await fetch(tokenUrl, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'client_credentials',client_id,client_secret,scope}) });
  const body = await response.json().catch(()=>({}));
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || `DVSA token failed (${response.status})`);
  tokenCache = { accessToken: body.access_token, expiresAt: now + Math.max(60, Number(body.expires_in||1200)-60)*1000 };
  return tokenCache.accessToken;
}
async function lookupMot(registration) {
  const apiKey = process.env.DVSA_API_KEY;
  if (!apiKey) throw new Error('DVSA_API_KEY is not configured.');
  const token = await dvsaToken();
  const base = String(process.env.DVSA_API_BASE_URL || 'https://history.mot.api.gov.uk').replace(/\/$/,'');
  const response = await fetch(`${base}/v1/trade/vehicles/registration/${encodeURIComponent(registration)}`, {headers:{Authorization:`Bearer ${token}`,'X-API-Key':apiKey,Accept:'application/json'}});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.errorMessage || body.message || `DVSA ${response.status}`);
  const vehicle = Array.isArray(body) ? body[0] : body;
  const tests = Array.isArray(vehicle?.motTests) ? vehicle.motTests : [];
  const last = latestTest(tests), passed = latestPassedTest(tests), current = passed || last;
  const defects = Array.isArray(current?.defects) ? current.defects : [];
  return {
    registration,
    motExpiryDate: isoDate(current?.expiryDate),
    lastMotTestDate: isoDate(vehicle?.lastMotTestDate || last?.completedDate),
    latestMileage: last?.odometerValue || '',
    motStatus: current?.expiryDate && Date.parse(current.expiryDate) >= Date.now() ? 'Valid' : (last ? 'Expired' : 'No MOT history'),
    advisories: defects.filter(d=>['ADVISORY','MINOR'].includes(String(d?.type||'').toUpperCase())).map(d=>String(d?.text||'').trim()).filter(Boolean)
  };
}
async function lookupTax(registration) {
  const apiKey = process.env.DVLA_API_KEY;
  if (!apiKey) return null;
  const url = process.env.DVLA_API_URL || 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
  const response = await fetch(url, {method:'POST', headers:{'x-api-key':apiKey,'content-type':'application/json',Accept:'application/json'}, body:JSON.stringify({registrationNumber:registration})});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.message || `DVLA ${response.status}`);
  return { taxDueDate: isoDate(body.taxDueDate), taxStatus: body.taxStatus || '', dvlaMotExpiryDate: isoDate(body.motExpiryDate), dvlaMotStatus: body.motStatus || '' };
}
function maintenanceCategory(value) {
  const t = String(value || '').toLowerCase();
  if (/six[- ]?month|6[- ]?month|safety check/.test(t)) return 'safety';
  if (/\bmot\b/.test(t)) return 'mot';
  if (/\btax\b|road tax/.test(t)) return 'tax';
  if (/service/.test(t) && !/on[- ]?site/.test(t)) return 'service';
  return t.trim();
}
function planFor(plans, vehicleId, type) {
  const category = maintenanceCategory(type);
  return plans.find(p=>String(p?.vehicleId||'')===String(vehicleId) && String(p?.status||'Active').toLowerCase()!=='paused' && maintenanceCategory(p?.type)===category) || null;
}
function shouldScanVehicle(vehicle, plans, full) {
  if (full) return true;
  const mot = planFor(plans, vehicle.id, 'MOT');
  const tax = planFor(plans, vehicle.id, 'Tax');
  return [mot,tax].filter(Boolean).some(p=>daysFromNow(p.currentDueDate || p.dueDate || '') <= 60);
}
function completionExists(completions, vehicleId, type, date) {
  return completions.some(c=>String(c?.vehicleId||'')===String(vehicleId) && String(c?.type||'').toLowerCase()===type.toLowerCase() && isoDate(c?.completedDate)===date);
}
function updatePlanDate(plans, vehicleId, type, newDate) {
  if (!newDate) return false;
  const p = planFor(plans, vehicleId, type);
  if (!p) return false;
  if (isoDate(p.currentDueDate) === newDate) return false;
  p.currentDueDate = newDate;
  p.updated_at = new Date().toISOString();
  return true;
}
async function supabaseRequest(path, options={}) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment variables are missing.');
  const response = await fetch(String(url).replace(/\/$/,'') + '/rest/v1/' + path, {
    ...options,
    headers:{ apikey:key, Authorization:`Bearer ${key}`, 'content-type':'application/json', Prefer:'return=representation,resolution=merge-duplicates', ...(options.headers||{}) }
  });
  const body = await response.json().catch(()=>null);
  if (!response.ok) throw new Error(body?.message || body?.error || `Supabase ${response.status}`);
  return body;
}
async function readSetting(id) {
  const rows = await supabaseRequest(`workshop_settings?id=eq.${encodeURIComponent(id)}&select=id,value,updated_at`);
  return Array.isArray(rows) ? rows[0] : null;
}
async function writeSetting(id, value) {
  return supabaseRequest('workshop_settings?on_conflict=id', {method:'POST', body:JSON.stringify({id,value,updated_at:new Date().toISOString()})});
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  if(process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({error:'Unauthorized'});
  const startedAt = new Date().toISOString();
  const status = {startedAt,finishedAt:'',checked:0,updated:0,errors:0,skipped:0,taxConfigured:!!process.env.DVLA_API_KEY,fullScan:false,errorSamples:[]};
  try{
    const row = await readSetting(FLEET_STATE_ID);
    if(!row?.value) throw new Error('Fleet cloud state has not been initialised yet. Open Fleet Manager once after deploying V77.');
    const state = row.value;
    const vehicles = Array.isArray(state.vehicles)?state.vehicles:[];
    const plans = Array.isArray(state.plans)?state.plans:[];
    const completions = Array.isArray(state.completions)?state.completions:[];
    const sunday = new Date().getUTCDay()===0;
    const full = req.query.full==='1' || sunday;
    status.fullScan = full;
    const candidates = vehicles.filter(v=>v && String(v.status||'Active').toLowerCase()!=='inactive' && v.roadGoing!==false && reg(v.registration).length>=2 && reg(v.registration).length<=8 && shouldScanVehicle(v,plans,full));
    for(const v of candidates){
      const registration=reg(v.registration);
      try{
        const mot=await lookupMot(registration);
        let changed=false;
        if(mot.motExpiryDate) changed = updatePlanDate(plans,v.id,'MOT',mot.motExpiryDate) || changed;
        const oldTest=isoDate(v.lastMotTestDate);
        if(mot.lastMotTestDate && mot.lastMotTestDate!==oldTest && !completionExists(completions,v.id,'MOT',mot.lastMotTestDate)){
          completions.push({id:`auto-mot-${String(v.id).replace(/[^A-Za-z0-9_-]/g,'')}-${mot.lastMotTestDate}`,vehicleId:v.id,type:'MOT',completedDate:mot.lastMotTestDate,datePrecision:'day',notes:`Automatically detected from DVSA${mot.latestMileage?` · ${mot.latestMileage} miles`:''}`,source:'DVSA automatic nightly refresh',created_at:new Date().toISOString()});
          changed=true;
        }
        Object.assign(v,{motDueDate:mot.motExpiryDate||v.motDueDate||'',motStatus:mot.motStatus,lastMotTestDate:mot.lastMotTestDate||v.lastMotTestDate||'',lastMotMileage:mot.latestMileage||v.lastMotMileage||'',motAdvisories:mot.advisories,motLastChecked:new Date().toISOString()});
        const tax=await lookupTax(registration);
        if(tax){
          if(tax.taxDueDate) changed = updatePlanDate(plans,v.id,'Tax',tax.taxDueDate) || changed;
          Object.assign(v,{taxDueDate:tax.taxDueDate||v.taxDueDate||'',taxStatus:tax.taxStatus||'',taxLastChecked:new Date().toISOString()});
        }
        status.checked++;
        if(changed)status.updated++;
      }catch(e){status.errors++;if(status.errorSamples.length<10)status.errorSamples.push({registration,error:String(e?.message||e)});}
      await sleep(120);
    }
    status.skipped=Math.max(0,vehicles.length-candidates.length);
    state.vehicles=vehicles;state.plans=plans;state.completions=completions;state.updated_at=new Date().toISOString();state.lastAutomaticRefresh=status.startedAt;
    await writeSetting(FLEET_STATE_ID,state);
    status.finishedAt=new Date().toISOString();
    await writeSetting(STATUS_ID,status);
    return res.status(200).json(status);
  }catch(e){status.finishedAt=new Date().toISOString();status.errors++;status.fatal=String(e?.message||e);try{await writeSetting(STATUS_ID,status)}catch(_e){}return res.status(500).json(status);}
}
