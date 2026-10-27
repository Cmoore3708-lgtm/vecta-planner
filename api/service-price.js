import {createHash} from 'node:crypto';
import {servicePriceRequest, calculateServicePrice, publicServicePrice, pricingPolicy} from '../lib/service-pricing.js';
import {signServicePrice, verifyServicePrice} from '../lib/service-price-token.js';
import {gsfQueue} from '../lib/gsf-queue.js';

export function servicePriceHandler({env = process.env, queue = gsfQueue, now = Date.now} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
    if (env.GSF_SERVICE_PRICING_ENABLED !== 'true') return res.status(200).json({status:'DISABLED'});
    try {
      const policy = pricingPolicy(JSON.parse(env.GSF_SERVICE_PRICING_POLICY || '{}'));
      if (!/^[a-f0-9]{64,128}$/.test(env.GSF_SERVICE_QUOTE_SECRET || '')) throw Error('SETTINGS_REQUIRED');
      if (Buffer.byteLength(JSON.stringify(req.body || {})) > 20000) return res.status(413).json({status:'INVALID_REQUEST'});
      const input = servicePriceRequest(req.body);
      // An existing signed offer remains valid for its lifetime, even offline.
      if (req.body.quoteToken) {
        try { return res.status(200).json({status:'MATCHED', quote:{...verifyServicePrice(req.body.quoteToken,input,env.GSF_SERVICE_QUOTE_SECRET,now()), token:req.body.quoteToken}}); } catch { /* Issue a current quote. */ }
      }
      // Hash addresses with a secret salt; never retain raw IPs in supplier jobs.
      const actor = createHash('sha256').update(env.GSF_SERVICE_QUOTE_SECRET || '').update(String(req.headers?.['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown')).digest('hex');
      const data = await queue('enqueue', {request:input, actor});
      if (data.status !== 'MATCHED') return res.status(200).json({status:['PENDING','OFFLINE','BUSY','DAILY_LIMIT','LOGIN_REQUIRED','REVIEW_REQUIRED','SETTINGS_REQUIRED','UNAVAILABLE'].includes(data.status) ? data.status : 'UNAVAILABLE'});
      const price = publicServicePrice(calculateServicePrice(data.result, input, policy, now()));
      return res.status(200).json({status:'MATCHED', quote:signServicePrice(price,env.GSF_SERVICE_QUOTE_SECRET,now())});
    } catch (error) {
      return res.status(error.message === 'INVALID_REQUEST' ? 400 : 200).json({status:error.message === 'INVALID_REQUEST' ? 'INVALID_REQUEST' : 'UNAVAILABLE'});
    }
  };
}
export default servicePriceHandler();
