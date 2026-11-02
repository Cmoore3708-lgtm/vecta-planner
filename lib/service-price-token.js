import {createHmac, timingSafeEqual, randomUUID, createHash, randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
import {servicePriceKey} from './service-pricing.js';
function signature(payload, secret) {
  if (!/^[a-f0-9]{64,128}$/.test(secret || '')) throw Error('SETTINGS_REQUIRED');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
// Private purchase costs travel as authenticated ciphertext, never public JSON.
export function readServiceCostSnapshot(price,secret){
 if(!price.costSnapshot)return null;
 const bytes=Buffer.from(price.costSnapshot,'base64url');
 if(bytes.length<29||bytes.length>12000)throw Error('INVALID_COST_SNAPSHOT');
 const key=createHash('sha256').update(secret).digest(),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
 decipher.setAAD(Buffer.from(servicePriceKey(price.request)+'|'+price.checkedAt));
 decipher.setAuthTag(bytes.subarray(12,28));
 const rows=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
 if(!Array.isArray(rows)||rows.length>17)throw Error('INVALID_COST_SNAPSHOT');
 return rows;
}
export function signServicePrice(price, secret, now = Date.now(), costs=null) {
  const quote = {...price, id:randomUUID(), issuedAt:now, expiresAt:now + 30 * 60000};
  if(costs){
    const rows=[...costs.items,...(costs.optionalParts||[])].map(({kind,sku,quantityMilli,unitNetPence,packNetPence,packQuantityMilli,estimated,estimateSource,pricingOnly,inStock})=>({kind,sku,quantityMilli,unitNetPence,...(packNetPence!==undefined?{packNetPence,packQuantityMilli}:{}),...(estimated?{estimated:true,estimateSource}:{}),...(pricingOnly?{pricingOnly:true}:{}),inStock}));
    const iv=randomBytes(12),key=createHash('sha256').update(secret).digest(),cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(servicePriceKey(price.request)+'|'+price.checkedAt));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(rows)),cipher.final()]);
    quote.costSnapshot=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  }
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
