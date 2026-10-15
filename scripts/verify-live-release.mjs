import {pathToFileURL} from 'node:url';

export async function verifyLiveRelease({commit,workshop='https://vecta-planner.vercel.app',website='https://www.vectamotors.co.uk',mechanic='https://vecta-mechanic-dashboard.vercel.app',fetch:request=fetch}){
 if(!/^[a-f0-9]{40}$/i.test(commit||''))throw Error('Supply the exact expected 40-character commit.');
 for(const value of [workshop,website,mechanic]){
  const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use HTTPS origins without credentials or paths.');
 }
 const probes=[['workshop',workshop+'/api/supabase-config?action=release'],['website',website+'/api/availability?action=release'],['mechanic',mechanic+'/api/supabase-config?action=release'],['workshop-access',workshop+'/api/supabase-config?action=access-health']];
 const checks=await Promise.all(probes.map(async([name,url])=>{
  try{
   const response=await request(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   if(name==='workshop-access')return {name,ok:data.ok===true&&data.authenticated_access===true};
   const application=name==='website'?'website':'workshop';
   return {name,ok:data.application===application&&data.commit===commit&&data.environment==='production',commit:data.commit||null,environment:data.environment||null};
  }catch(error){return {name,ok:false,error:error.name==='TimeoutError'?'Timed out':error.message};}
 }));
 return {ok:checks.every(check=>check.ok),expectedCommit:commit,checkedAt:new Date().toISOString(),checks};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2),allowed=new Set(['--commit','--workshop','--website','--mechanic']),options={};
  for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1])throw Error('Usage: node scripts/verify-live-release.mjs --commit <sha> [--workshop <origin>] [--website <origin>] [--mechanic <origin>]');options[args[i].slice(2)]=args[i+1];}
  const result=await verifyLiveRelease(options);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
 }catch(error){console.error(error.message);process.exitCode=1;}
}
