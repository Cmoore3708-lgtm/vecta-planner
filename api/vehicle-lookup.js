export function createVehicleLookup({fetch: request = (...args) => fetch(...args), env = process.env, now = Date.now, tokenTimeout = 4000, motTimeout = 8000, taxTimeout = 4000, maxInFlight = 64} = {}) {
let tokenCache = { accessToken: '', expiresAt: 0 };
let tokenPending = null;
const pendingVehicles = new Map();

async function readPayload(response){
  return response.json().catch(error=>{
    if(response.ok||['TimeoutError','AbortError'].includes(error?.name))throw error;
    return {};
  });
}

function normaliseRegistration(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function latestPassedTest(tests) {
  return [...tests]
    .filter(test => String(test?.testResult || '').toUpperCase() === 'PASSED')
    .sort((a, b) => Date.parse(b?.completedDate || 0) - Date.parse(a?.completedDate || 0))[0] || null;
}

function latestTest(tests) {
  return [...tests].sort((a, b) => Date.parse(b?.completedDate || 0) - Date.parse(a?.completedDate || 0))[0] || null;
}

async function getAccessToken() {
  const startedAt = now();
  if (tokenCache.accessToken && tokenCache.expiresAt > startedAt + 60_000) return tokenCache.accessToken;

  if (tokenPending) return tokenPending;
  tokenPending = (async () => {
  const clientId = env.DVSA_CLIENT_ID;
  const clientSecret = env.DVSA_CLIENT_SECRET;
  const scope = env.DVSA_SCOPE;
  const tokenUrl = env.DVSA_TOKEN_URL;
  if (!clientId || !clientSecret || !scope || !tokenUrl) {
    throw new Error('DVSA credentials are not configured in Vercel.');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope
  });

  const response = await request(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body, signal: AbortSignal.timeout(tokenTimeout)
  });

  const payload = await readPayload(response);
  if (!response.ok || !payload.access_token) {
    const message = payload.error_description || payload.error || `Token request failed (${response.status})`;
    throw new Error(message);
  }

  const expiresIn = Number(payload.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error('Invalid DVSA token expiry');
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: startedAt + expiresIn * 1000
  };
  return tokenCache.accessToken;
  })();
  try { return await tokenPending; } finally { tokenPending = null; }
}


async function lookupTax(registration) {
  const apiKey = env.DVLA_API_KEY;
  if (!apiKey) return null;
  const url = env.DVLA_API_URL || 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
  const response = await request(url, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ registrationNumber: registration }), signal: AbortSignal.timeout(taxTimeout)
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(payload.message || `DVLA request failed (${response.status})`);
  return {
    primaryColour: payload.colour || '',
    engineCapacity: payload.engineCapacity || '',
    taxStatus: payload.taxStatus || '',
    taxDueDate: payload.taxDueDate || '',
    dvlaMotStatus: payload.motStatus || '',
    dvlaMotExpiryDate: payload.motExpiryDate || '',
    dvlaFetchedAt: new Date().toISOString()
  };
}

async function lookupVehicle(registration) {
  // Tax failures must not discard a successful MOT result. Starting both
  // providers here removes the old sequential wait; each has its own deadline.
  const taxPending = lookupTax(registration).then(value => ({value, status:value?'available':'not_configured'}), () => ({value:null,status:'unavailable'}));
  try {
    const apiKey = env.DVSA_API_KEY;
    if (!apiKey) throw new Error('DVSA_API_KEY is not configured in Vercel.');
    const token = await getAccessToken();
    const baseUrl = String(env.DVSA_API_BASE_URL || 'https://history.mot.api.gov.uk').replace(/\/$/, '');
    const response = await request(`${baseUrl}/v1/trade/vehicles/registration/${encodeURIComponent(registration)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-API-Key': apiKey,
        Accept: 'application/json'
      }, signal: AbortSignal.timeout(motTimeout)
    });

    const payload = await readPayload(response);
    if (!response.ok) {
      const code = payload.errorCode || payload.code || '';
      const message = payload.errorMessage || payload.message || (response.status === 404 ? 'Vehicle not found' : `DVSA request failed (${response.status})`);
      if(response.status===401)tokenCache={accessToken:'',expiresAt:0};
      return {status:response.status,body:{error:message,code}};
    }

    const vehicle = Array.isArray(payload) ? payload[0] : payload;
    if(!vehicle||typeof vehicle!=='object'||!vehicle.make)throw new Error('Invalid vehicle response');
    const motTests = Array.isArray(vehicle?.motTests) ? vehicle.motTests : [];
    const lastTest = latestTest(motTests);
    const lastPass = latestPassedTest(motTests);
    const currentTest = lastPass || lastTest;
    const currentDefects = Array.isArray(currentTest?.defects) ? currentTest.defects : [];
    const advisories = currentDefects
      .filter(defect => ['ADVISORY', 'MINOR'].includes(String(defect?.type || '').toUpperCase()))
      .map(defect => String(defect?.text || '').trim())
      .filter(Boolean);

    const taxResult = await taxPending, tax = taxResult.value;

    return {status:200,body:{
      registration: vehicle?.registration || registration,
      make: vehicle?.make || '',
      model: vehicle?.model || '',
      vehicle: [vehicle?.make, vehicle?.model].filter(Boolean).join(' '),
      fuelType: vehicle?.fuelType || '',
      primaryColour: tax?.primaryColour || vehicle?.primaryColour || '',
      // The DVSA MOT history response does not reliably include engine size.
      // DVLA Vehicle Enquiry supplies engineCapacity, so prefer that value for
      // automatic service pricing and retain the DVSA value as a fallback.
      engineSize: tax?.engineCapacity || vehicle?.engineSize || '',
      engineCapacity: tax?.engineCapacity || vehicle?.engineSize || '',
      firstUsedDate: vehicle?.firstUsedDate || vehicle?.registrationDate || '',
      manufactureDate: vehicle?.manufactureDate || '',
      lastMotTestDate: vehicle?.lastMotTestDate || lastTest?.completedDate || '',
      motExpiryDate: currentTest?.expiryDate || '',
      motStatus: currentTest?.expiryDate && Date.parse(currentTest.expiryDate) >= now() ? 'Valid' : (lastTest ? 'Expired' : 'No MOT history'),
      latestMileage: lastTest?.odometerValue || '',
      latestMileageUnit: lastTest?.odometerUnit || '',
      advisories,
      currentDefects,
      motTests,
      taxStatus: tax?.taxStatus || '',
      taxDueDate: tax?.taxDueDate || '',
      dvlaMotStatus: tax?.dvlaMotStatus || '',
      dvlaMotExpiryDate: tax?.dvlaMotExpiryDate || '',
      taxApiConfigured: Boolean(env.DVLA_API_KEY),
      taxLookupStatus: taxResult.status,
      fetchedAt: new Date(now()).toISOString()
    }};
  } catch (error) {
    const timeout=['TimeoutError','AbortError'].includes(error?.name);
    return {status:timeout?504:502,body:{error:timeout?'Vehicle lookup timed out. Please try again.':'Vehicle lookup is temporarily unavailable. Please try again.'}};
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');
  if (Array.isArray(req.query?.reg)) return res.status(400).json({error:'Enter one registration'});
  const registration = normaliseRegistration(req.query?.reg);
  if (!registration) return res.status(400).json({ error: 'Registration required' });
  if (registration.length < 2 || registration.length > 8) return res.status(400).json({ error: 'Enter a valid registration' });

  let pending = pendingVehicles.get(registration);
  if (!pending) {
    if (pendingVehicles.size >= maxInFlight) {res.setHeader('Retry-After','5');return res.status(503).json({error:'Vehicle lookup is busy. Please try again shortly.'});}
    pending = lookupVehicle(registration);
    pendingVehicles.set(registration, pending);
    pending.finally(() => {if(pendingVehicles.get(registration)===pending)pendingVehicles.delete(registration);});
  }
  const result = await pending;
  return res.status(result.status).json(structuredClone(result.body));
}
return handler;
}
export default createVehicleLookup();
