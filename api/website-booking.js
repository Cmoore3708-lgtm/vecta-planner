export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Booking service is not configured' });
  try {
    const body = req.body || {};
    const required = ['customer_name','email','phone','registration','vehicle','work_required','preferred_date_1'];
    for (const field of required) if (!String(body[field] || '').trim()) return res.status(400).json({ error: `Missing ${field}` });
    const payload = {
      id: crypto.randomUUID(),
      customer_name: String(body.customer_name).trim(),
      email: String(body.email).trim(),
      phone: String(body.phone).trim(),
      registration: String(body.registration).toUpperCase().replace(/\s+/g,' ').trim(),
      vehicle: String(body.vehicle).trim(),
      mileage: String(body.mileage || '').trim(),
      mot_due: body.mot_due || null,
      job_types: Array.isArray(body.job_types) ? body.job_types : [],
      work_required: String(body.work_required).trim(),
      preferred_date_1: body.preferred_date_1,
      preferred_date_2: body.preferred_date_2 || null,
      preferred_date_3: body.preferred_date_3 || null,
      completion_deadline: String(body.completion_deadline || '').trim(),
      contact_preference: String(body.contact_preference || 'Email'),
      source: 'Website booking',
      status: 'awaiting_review',
      created_at: new Date().toISOString()
    };
    const response = await fetch(`${url}/rest/v1/website_booking_requests`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type':'application/json', Prefer:'return=minimal' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(await response.text());
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to submit booking request' });
  }
}
