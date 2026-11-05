import {sceneFingerprint} from './progress-scene-model.js';

export const sceneRequestId=registration=>'progress_scene_request_v1:'+registration;

// Called only after the progress handler has verified the booking/token. A view
// records demand, never clears drafts, resets attempts or replaces saved images.
export async function requestScenePreparation({db,identity,source,now=Date.now()}){
 const id=sceneRequestId(identity.registration),fingerprint=sceneFingerprint(identity);
 const old=(await db('workshop_settings?'+new URLSearchParams({id:'eq.'+id,select:'id,value,updated_at',limit:'1'})))?.[0];
 if(old?.value?.fingerprint===fingerprint)return old.value.status==='pending'?'preparing':'unavailable';
 const stamp=new Date(now).toISOString(),record={id,value:{registration:identity.registration,fingerprint,source,status:'pending',requested_at:stamp},updated_at:stamp};
 // Ignore simultaneous first opens; conditionally replace only a genuinely
 // changed identity. Refreshes cannot put a completed/failed set back in queue.
 const rows=old?await db('workshop_settings?'+new URLSearchParams({id:'eq.'+id,updated_at:'eq.'+old.updated_at}),{method:'PATCH',body:JSON.stringify(record)}):await db('workshop_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(record)});
 return rows?.length?'preparing':'unavailable';
}
