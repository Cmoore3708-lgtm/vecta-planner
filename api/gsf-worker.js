import {timingSafeEqual} from 'node:crypto';
import {cleanServiceCosts, servicePriceRequest} from '../lib/service-pricing.js';
import {gsfQueue} from '../lib/gsf-queue.js';
export function gsfWorkerHandler({env = process.env, queue = gsfQueue} = {}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    if (req.method !== 'POST') return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
    const secret = env.GSF_WORKER_TOKEN || '', token = String(req.headers?.authorization || '').replace(/^Bearer /,'');
    if (!/^[a-f0-9]{64}$/.test(secret) || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token),Buffer.from(secret))) return res.status(401).json({status:'UNAUTHORIZED'});
    if (env.GSF_SERVICE_PRICING_ENABLED !== 'true') return res.status(200).json({status:'DISABLED'});
    try {
      const body = req.body || {};
      if (Buffer.byteLength(JSON.stringify(body)) > 24000) return res.status(413).json({status:'INVALID_REQUEST'});
      if (body.action === 'pull') return res.status(200).json(await queue('pull',{}));
      if (body.action !== 'complete' || !/^[a-f0-9-]{36}$/.test(body.id || '') || !/^[a-f0-9-]{36}$/.test(body.lease || '') ||
          !['MATCHED','LOGIN_REQUIRED','REVIEW_REQUIRED','SETTINGS_REQUIRED','UNAVAILABLE'].includes(body.status)) return res.status(400).json({status:'INVALID_REQUEST'});
      const request = servicePriceRequest(body.request);
      const result = body.status === 'MATCHED' ? cleanServiceCosts(body.result,request) : null;
      return res.status(200).json(await queue('complete',{id:body.id,lease:body.lease,request,status:body.status,result}));
    } catch { return res.status(200).json({status:'UNAVAILABLE'}); }
  };
}
export default gsfWorkerHandler();
