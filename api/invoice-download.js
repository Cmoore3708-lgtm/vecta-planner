import { databaseEnvironment } from './_database-environment.js';
import { invoicePdf, sharePrefix, validShareToken, validShare, downloadableInvoice } from '../lib/invoice-download.js';
export function createDownloadHandler(fetcher=fetch,render=invoicePdf){return async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).send('Method not allowed');}
 const token=req.query?.token;if(!validShareToken(token))return res.status(404).send('Invoice link not found.');
 try{
  const {url,publishableKey}=databaseEnvironment();
  async function rows(table,query){const response=await fetcher(url+'/rest/v1/'+table+'?'+query,{headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey},signal:AbortSignal.timeout(15000),cache:'no-store'});if(!response.ok)throw new Error('Database request failed');return response.json();}
  const links=await rows('workshop_settings','select=value&id=eq.'+encodeURIComponent(sharePrefix+token));const value=links[0]?.value;
  if(!validShare(value))return res.status(404).send('This invoice link has expired or is unavailable. Please contact VECTA Motors.');
  const invoices=await rows('invoices','select=*&id=eq.'+encodeURIComponent(value.invoice_id)),invoice=invoices[0];
  if(!downloadableInvoice(invoice))return res.status(404).send('This invoice is no longer available. Please contact VECTA Motors.');
  const settings=await rows('workshop_settings','select=value&id=eq.main');
  const pdf=await render(invoice,settings[0]?.value||{}),filename=String(invoice.invoice_number||'invoice').replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf';
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="'+filename+'"');return res.status(200).send(pdf);
 }catch(error){console.error('Invoice download unavailable',error.message);return res.status(503).send('Invoice download is temporarily unavailable. Please try again shortly.');}
};}
export default createDownloadHandler();
