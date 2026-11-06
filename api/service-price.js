import {workshopPricingAuthorised,workshopServiceResult,workshopTyreResult} from '../lib/workshop-job-pricing.js';
import {estimateWorkshopService} from '../lib/workshop-service-estimate.js';
import {estimateMissingServiceCosts} from '../lib/service-guide-costs.js';
import {pricingVisitor} from '../lib/pricing-visitor.js';
import {managerAuthorised} from './message-centre.js';
import {receiptRpc} from '../lib/booking-receipts.js';
import {servicePriceRequest, serviceRequiredKinds, cleanServiceQuoteCosts, cleanPartialServiceCosts, COMPARISON_SERVICES, calculateServicePrice, publicServicePrice, pricingPolicy} from '../lib/service-pricing.js';
import {signServicePrice, verifyServicePrice} from '../lib/service-price-token.js';
import {gsfQueue,serviceCostHistory} from '../lib/gsf-queue.js';
import {serviceExtraPrice} from '../lib/service-extras.js';

export function servicePriceHandler({env = process.env, queue = gsfQueue, history = serviceCostHistory, now = Date.now} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if(req.method==='GET'&&req.query?.health==='1'){
      if(!await managerAuthorised(req))return res.status(401).json({error:'Manager sign-in required.'});
      try{return res.status(200).json({pricing:await queue('health',{}),receipts:await receiptRpc('health').catch(()=>null)});}
      catch{return res.status(503).json({error:'Pricing status is temporarily unavailable.'});}
    }
    if (req.method !== 'POST') return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
    const workshop=req.body?.workshop===true;
    if(workshop){
      if(!await workshopPricingAuthorised(req))return res.status(401).json({status:'UNAUTHORISED'});
      if(req.body.action==='tyreParts'){
        try{return res.status(200).json(workshopTyreResult(req.body,env.GSF_SERVICE_QUOTE_SECRET));}
        catch{return res.status(400).json({status:'INVALID_TYRE_QUOTE'});}
      }
      if(req.body.allServices)return res.status(400).json({status:'INVALID_REQUEST'});
      const json=res.json.bind(res);
      res.json=data=>json(workshopServiceResult(data,env.GSF_SERVICE_QUOTE_SECRET));
    }
    if (!workshop && env.GSF_SERVICE_PRICING_ENABLED !== 'true') return res.status(200).json({status:'DISABLED'});
    try {
      const policy = pricingPolicy(JSON.parse(env.GSF_SERVICE_PRICING_POLICY || '{}'));
      if (!/^[a-f0-9]{64,128}$/.test(env.GSF_SERVICE_QUOTE_SECRET || '')) throw Error('SETTINGS_REQUIRED');
      if (Buffer.byteLength(JSON.stringify(req.body || {})) > 20000) return res.status(413).json({status:'INVALID_REQUEST'});
      const input = servicePriceRequest(req.body);
      const estimate=async partial=>{let recent=[];try{recent=await history();}catch{/* Use the saved allowances if no history is available. */}return estimateWorkshopService(input,partial,recent,policy,now());};
      if(workshop&&(req.body.action==='estimate'||env.GSF_SERVICE_PRICING_ENABLED!=='true'))return res.status(200).json(await estimate(null));
      const batch = req.body.allServices === true;
      const supplierRequest = batch ? {...input,service:'Major Service',mileage:null} : input;
      // An existing signed offer remains valid for its lifetime, even offline.
      if (!batch && req.body.quoteToken) {
        try { return res.status(200).json({status:'MATCHED', quote:{...verifyServicePrice(req.body.quoteToken,input,env.GSF_SERVICE_QUOTE_SECRET,now()), token:req.body.quoteToken}}); } catch { /* Issue a current quote. */ }
      }
      const actor = pricingVisitor(req,res,env.GSF_SERVICE_QUOTE_SECRET,now());
      let data;try{data=await queue('enqueue',{request:supplierRequest,actor});}catch(error){if(!workshop)throw error;data={status:'UNAVAILABLE'};}
      if(workshop&&!['PENDING','MATCHED'].includes(data.status))return res.status(200).json(await estimate(null));
      if (data.status !== 'MATCHED') return res.status(200).json({status:['PENDING','OFFLINE','BUSY','DAILY_LIMIT','LOGIN_REQUIRED','REVIEW_REQUIRED','SETTINGS_REQUIRED','UNAVAILABLE'].includes(data.status) ? data.status : 'UNAVAILABLE'});
      if(data.result?.partial){
        const partial=cleanPartialServiceCosts(data.result,supplierRequest,now());
        return res.status(200).json(workshop?await estimate(partial):{status:'UNAVAILABLE'});
      }
      let result=cleanServiceQuoteCosts(data.result,supplierRequest,now());
      if(result.guidePrice){
        let recent=[];try{recent=await history();}catch{ /* Use the agreed allowances when history cannot be read. */ }
        result=estimateMissingServiceCosts(result,supplierRequest,recent,now());
      }
      if(batch){
        const costs=result;
        const quotes=[...COMPARISON_SERVICES,'Interim Service'].map(service=>{
          const request={...input,service},requiredKinds=serviceRequiredKinds(service,costs.fuelType);
          const items=costs.items.filter(item=>requiredKinds.includes(item.kind));
          const guidePrice=items.some(item=>item.estimated||item.pricingOnly);
          const selected={...costs,request,requiredKinds,items,guidePrice,fitmentVerified:!guidePrice};
          const price=publicServicePrice(calculateServicePrice(selected,request,policy,now()));
          if(service==='Full Service')price.serviceExtra=serviceExtraPrice(costs,policy);
          return signServicePrice(price,env.GSF_SERVICE_QUOTE_SECRET,now(),costs);
        });
        return res.status(200).json({status:'MATCHED',quotes});
      }
      const price = publicServicePrice(calculateServicePrice(result, input, policy, now()));
      return res.status(200).json({status:'MATCHED', quote:signServicePrice(price,env.GSF_SERVICE_QUOTE_SECRET,now(),result)});
    } catch (error) {
      return res.status(error.message === 'INVALID_REQUEST' ? 400 : 200).json({status:error.message === 'INVALID_REQUEST' ? 'INVALID_REQUEST' : 'UNAVAILABLE'});
    }
  };
}
export default servicePriceHandler();
