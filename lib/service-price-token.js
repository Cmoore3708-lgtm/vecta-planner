import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import {servicePriceKey} from './service-pricing.js';
function signature(payload, secret) {
  if (!/^[a-f0-9]{64,128}$/.test(secret || '')) throw Error('SETTINGS_REQUIRED');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
export function signServicePrice(price, secret, now = Date.now()) {
  const quote = {...price, id:randomUUID(), issuedAt:now, expiresAt:now + 30 * 60000};
  const payload = Buffer.from(JSON.stringify(quote)).toString('base64url');
  return {...quote, token:payload + '.' + signature(payload, secret)};
}
export function verifyServicePrice(token, request, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 16000) throw Error('INVALID_QUOTE');
  const [payload, mac, extra] = token.split('.');
  if (!payload || !mac || extra) throw Error('INVALID_QUOTE');
  const expected = signature(payload, secret), supplied = Buffer.from(mac);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, Buffer.from(expected))) throw Error('INVALID_QUOTE');
  const price = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (servicePriceKey(price.request) !== servicePriceKey(request) || !Number.isSafeInteger(price.expiresAt) ||
      price.expiresAt <= now || price.issuedAt > now + 60000 || price.expiresAt - price.issuedAt !== 1800000 ||
      !Number.isSafeInteger(price.totalPence) || price.totalPence < 1 || price.netPence + price.vatPence !== price.totalPence) throw Error('EXPIRED_OR_MISMATCHED_QUOTE');
  return price;
}
