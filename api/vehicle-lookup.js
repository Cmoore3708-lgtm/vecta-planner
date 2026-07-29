let tokenCache = { accessToken: '', expiresAt: 0 };

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
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 60_000) return tokenCache.accessToken;

  const clientId = process.env.DVSA_CLIENT_ID;
  const clientSecret = process.env.DVSA_CLIENT_SECRET;
  const scope = process.env.DVSA_SCOPE;
  const tokenUrl = process.env.DVSA_TOKEN_URL;
  if (!clientId || !clientSecret || !scope || !tokenUrl) {
    throw new Error('DVSA credentials are not configured in Vercel.');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const message = payload.error_description || payload.error || `Token request failed (${response.status})`;
    throw new Error(message);
  }

  const expiresIn = Number(payload.expires_in || 1200);
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: now + Math.max(60, expiresIn - 60) * 1000
  };
  return tokenCache.accessToken;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const registration = normaliseRegistration(req.query.reg);
  if (!registration) return res.status(400).json({ error: 'Registration required' });
  if (registration.length < 2 || registration.length > 8) return res.status(400).json({ error: 'Enter a valid registration' });

  try {
    const apiKey = process.env.DVSA_API_KEY;
    if (!apiKey) throw new Error('DVSA_API_KEY is not configured in Vercel.');
    const token = await getAccessToken();
    const baseUrl = String(process.env.DVSA_API_BASE_URL || 'https://history.mot.api.gov.uk').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v1/trade/vehicles/registration/${encodeURIComponent(registration)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-API-Key': apiKey,
        Accept: 'application/json'
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = payload.errorCode || payload.code || '';
      const message = payload.errorMessage || payload.message || (response.status === 404 ? 'Vehicle not found' : `DVSA request failed (${response.status})`);
      return res.status(response.status).json({ error: message, code });
    }

    const vehicle = Array.isArray(payload) ? payload[0] : payload;
    const motTests = Array.isArray(vehicle?.motTests) ? vehicle.motTests : [];
    const lastTest = latestTest(motTests);
    const lastPass = latestPassedTest(motTests);
    const currentTest = lastPass || lastTest;
    const currentDefects = Array.isArray(currentTest?.defects) ? currentTest.defects : [];
    const advisories = currentDefects
      .filter(defect => ['ADVISORY', 'MINOR'].includes(String(defect?.type || '').toUpperCase()))
      .map(defect => String(defect?.text || '').trim())
      .filter(Boolean);

    return res.status(200).json({
      registration: vehicle?.registration || registration,
      make: vehicle?.make || '',
      model: vehicle?.model || '',
      vehicle: [vehicle?.make, vehicle?.model].filter(Boolean).join(' '),
      fuelType: vehicle?.fuelType || '',
      primaryColour: vehicle?.primaryColour || '',
      engineSize: vehicle?.engineSize || '',
      firstUsedDate: vehicle?.firstUsedDate || vehicle?.registrationDate || '',
      manufactureDate: vehicle?.manufactureDate || '',
      lastMotTestDate: vehicle?.lastMotTestDate || lastTest?.completedDate || '',
      motExpiryDate: currentTest?.expiryDate || '',
      motStatus: currentTest?.expiryDate && Date.parse(currentTest.expiryDate) >= Date.now() ? 'Valid' : (lastTest ? 'Expired' : 'No MOT history'),
      latestMileage: lastTest?.odometerValue || '',
      latestMileageUnit: lastTest?.odometerUnit || '',
      advisories,
      currentDefects,
      motTests,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('DVSA vehicle lookup failed', error);
    return res.status(500).json({ error: error?.message || 'Vehicle lookup failed' });
  }
}
