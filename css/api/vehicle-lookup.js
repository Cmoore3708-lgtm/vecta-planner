export default async function handler(req, res) {
  const reg = String(req.query.reg || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!reg) return res.status(400).json({ error: 'Registration required' });

  // Ready for real DVLA/DVSA integration.
  // Add keys in Vercel Environment Variables, then replace this demo response.
  return res.status(200).json({
    registrationNumber: reg.replace(/(.{4})/, '$1 ').trim(),
    make: 'BMW',
    model: '320d M Sport',
    fuelType: 'Diesel',
    colour: 'Black',
    engineCapacity: '1995',
    motStatus: 'Valid',
    motExpiryDate: '14 Feb 2027',
    taxStatus: 'Taxed',
    taxDueDate: '31 Jan 2027',
    demo: true
  });
}
