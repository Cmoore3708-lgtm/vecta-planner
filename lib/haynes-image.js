import {imageSource,validAsset} from './haynes-image-source.js';
// Fixed supplier host and numeric asset ID only: never proxy arbitrary URLs.
export default async function haynesImage(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const asset=String(req.query?.asset||'');if(!validAsset(asset))return res.status(400).json({error:'Invalid image'});
 try{const svg=await imageSource(asset);res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('X-Content-Type-Options','nosniff');if(req.query?.format==='svg'){res.setHeader('Content-Type','image/svg+xml');res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; style-src 'unsafe-inline'");return res.status(200).send(svg);}return res.status(200).json({svg});}
 catch{return res.status(502).json({error:'Image temporarily unavailable'});}
}
