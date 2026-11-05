import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';

export const pricingCookie = '__Host-vecta-pricing';
const lifetime = 86400;
const mac = (value, secret) => createHmac('sha256', secret).update('pricing-browser-v1\n' + value).digest('hex');

// A signed, first-party browser identity: colleagues behind one factory gateway
// must not share a per-visitor allowance. The global queue budget still applies.
export function pricingVisitor(req, res, secret, now = Date.now()) {
  const cookie = String(req.headers?.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(pricingCookie + '='))?.slice(pricingCookie.length + 1) || '';
  const [id, expires, signature] = cookie.split('.');
  const value = id + '.' + expires;
  const valid = /^[0-9a-f-]{36}$/.test(id || '') && /^\d{10}$/.test(expires || '') && /^[a-f0-9]{64}$/.test(signature || '') &&
    Number(expires) > now / 1000 && Number(expires) <= now / 1000 + lifetime + 60 &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(mac(value, secret)));
  const identity = valid ? id : randomUUID();
  if (!valid) {
    const next = identity + '.' + Math.floor(now / 1000 + lifetime);
    res.setHeader('Set-Cookie', `${pricingCookie}=${next}.${mac(next, secret)}; Path=/; Max-Age=${lifetime}; HttpOnly; Secure; SameSite=Lax`);
  }
  return mac(identity, secret);
}
