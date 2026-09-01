import {pushConfig} from './_push.js';
export default function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});try{return res.status(200).json(pushConfig())}catch(error){return res.status(503).json({error:error.message||'Push alerts are unavailable'})}}
