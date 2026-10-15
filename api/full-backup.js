import {streamBackup} from '../lib/stream-backup.js';
import {databaseEnvironment} from './_database-environment.js';
import {dataChecksum,validateBackup} from '../lib/backup-integrity.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const secret=process.env.CRON_SECRET;
 if(!secret)return res.status(503).json({error:'CRON_SECRET is not configured.'});
 if(req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized'});
 try{
  const {url,key}=databaseEnvironment({requireService:true}),startedAt=new Date().toISOString();
  const response=await fetch(`${url}/rest/v1/rpc/vecta_export_workshop_backup`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('The database could not produce a consistent workshop backup.');
  const snapshot=await response.json();
  const backup={...snapshot,format:'VECTA_WORKSHOP_PRO_FULL_BACKUP_V1',backup_version:2,created_at:new Date().toISOString(),started_at:startedAt,supabase_project:new URL(url).hostname.split('.')[0],skipped_optional_tables:{},data_sha256:dataChecksum(snapshot.data)};
  validateBackup(backup);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="VECTA-FULL-BACKUP-${backup.created_at.slice(0,10)}.json"`);
  await streamBackup(res,backup);return;
 }catch(error){console.error('Full backup failed',error);if(res.headersSent){res.destroy(error);return;}return res.status(500).json({error:String(error?.message||error)});}
}
