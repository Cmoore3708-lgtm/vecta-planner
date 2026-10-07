import { gunzipSync } from 'node:zlib';

// Fixed supplier host and numeric asset ID only: never proxy arbitrary URLs.
export default async function haynesImage(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const asset = String(req.query?.asset || '');
  if (!/^\d{1,12}\.svgz?$/.test(asset)) return res.status(400).json({ error: 'Invalid image' });
  try {
    const response = await fetch('https://www.haynespro-assets.com/workshop/images/' + asset, {
      redirect: 'error', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw Error('Image unavailable');
    if (Number(response.headers.get('content-length')) > 1000000) throw Error('Image too large');
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 1000000) throw Error('Image too large');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    let buffer = Buffer.concat(chunks);
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = gunzipSync(buffer, { maxOutputLength: 2000000 });
    const svg = buffer.toString('utf8');
    if (svg.length > 2000000 || !/<svg\b/.test(svg)) throw Error('Invalid image');
    // JSON transport is intentionally inert; the client rebuilds an allowlisted SVG.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json({ svg });
  } catch { return res.status(502).json({ error: 'Image temporarily unavailable' }); }
}
