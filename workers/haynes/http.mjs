import { timingSafeEqual } from 'node:crypto';
import { HaynesError } from '../../lib/haynes-vehicle.js';

export function createHandler(service, token) {
  if (!token || token.length < 32) throw Error('A worker token of at least 32 characters is required.');
  const expected = Buffer.from('Bearer ' + token);
  return async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    const supplied = Buffer.from(req.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { req.resume(); return send(401, { status: 'UNAUTHORISED' }); }
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'RUNNING' });
    if (req.method !== 'POST' || req.url !== '/lookup') { req.resume(); return send(404, { status: 'NOT_FOUND' }); }
    let bytes = 0, chunks = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024) { send(413, { status: 'TOO_LARGE' }); req.destroy(); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new HaynesError('INVALID_REGISTRATION'); }
      if (typeof body?.registration !== 'string') throw new HaynesError('INVALID_REGISTRATION');
      return send(200, { status: 'MATCHED', vehicle: await service(body.registration) });
    } catch (error) {
      const code = error instanceof HaynesError ? error.code : 'UNAVAILABLE';
      return send(code === 'INVALID_REGISTRATION' ? 400 : 503, { status: code });
    }
  };
}
