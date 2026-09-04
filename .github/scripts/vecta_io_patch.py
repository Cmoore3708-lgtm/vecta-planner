from pathlib import Path

path=Path('index.html')
text=path.read_text(encoding='utf-8')
original=text

text=text.replace("    .on('postgres_changes',{event:'*',schema:'public',table:'workshop_settings'},scheduleCloudRefresh)\n",'',1)

old="""function scheduleCloudRefresh(){
  if(cloudRefreshDebounce)clearTimeout(cloudRefreshDebounce);
  cloudRefreshDebounce=setTimeout(function(){cloudRefreshDebounce=null;refreshCloudAndRender()},1200);
}"""
new="""function scheduleCloudRefresh(payload){
  if(!payload||!payload.table)return;
  var table=String(payload.table||''),eventType=String(payload.eventType||payload.event||'').toUpperCase(),row=payload.new&&typeof payload.new==='object'?payload.new:null,oldRow=payload.old&&typeof payload.old==='object'?payload.old:null;
  if(table==='workshop_settings')return;
  try{
    if((eventType==='INSERT'||eventType==='UPDATE')&&row&&row.id){
      if(table==='jobs'){vectaReconcileJobsFromCloud([row]);vectaApplyTerminalJobStates();}
      else{
        var key=table==='service_records'?'serviceRecords':(table==='website_booking_requests'?'websiteRequests':table);
        if(Object.prototype.hasOwnProperty.call(app,key))app[key]=mergeRemoteRows(app[key]||[],[row]);
      }
    }else if(eventType==='DELETE'&&oldRow&&oldRow.id&&table!=='jobs'){
      var deleteKey=table==='service_records'?'serviceRecords':(table==='website_booking_requests'?'websiteRequests':table);
      if(Array.isArray(app[deleteKey]))app[deleteKey]=app[deleteKey].filter(function(x){return String(x&&x.id||'')!==String(oldRow.id)});
    }
    saveLocal();
    if(cloudRefreshDebounce)clearTimeout(cloudRefreshDebounce);
    cloudRefreshDebounce=setTimeout(function(){
      cloudRefreshDebounce=null;
      var active=document.activeElement;
      if(view==='settings'||(active&&active.closest&&active.closest('.settingsGrid'))||plannerInteractionBusy)return;
      render();
    },180);
  }catch(e){console.warn('Realtime row merge skipped; safety refresh will reconcile later.',e)}
}"""
if old not in text: raise SystemExit('scheduleCloudRefresh block not found')
text=text.replace(old,new,1)

old_save="async function saveAll(){invalidateFinanceDashboardCache();saveLocal(); if(remoteClient){try{await remoteClient.from('workshop_settings').upsert({id:'main',value:app.settings,updated_at:new Date().toISOString()});}catch(e){}}}"
new_save="""var vectaMainSettingsLastPersisted='';
function vectaSettingsSignature(value){try{return JSON.stringify(value==null?null:value)}catch(e){return String(value)}}
async function persistMainSettings(){if(!remoteClient)return false;var sig=vectaSettingsSignature(app.settings||{});if(sig===vectaMainSettingsLastPersisted)return true;try{var res=await remoteClient.from('workshop_settings').upsert({id:'main',value:app.settings,updated_at:new Date().toISOString()},{onConflict:'id'});if(res&&res.error)throw res.error;vectaMainSettingsLastPersisted=sig;return true}catch(e){console.warn('Main settings cloud save failed',e);return false}}
async function saveAll(){invalidateFinanceDashboardCache();saveLocal();if(remoteClient)await persistMainSettings()}"""
if old_save not in text: raise SystemExit('saveAll block not found')
text=text.replace(old_save,new_save,1)

old_main="try{var st=await remoteClient.from('workshop_settings').select('*').eq('id','main').single(); if(!st.error&&st.data&&st.data.value){app.settings=merge(app.settings,st.data.value)}}catch(e){}"
new_main="try{var st=await remoteClient.from('workshop_settings').select('*').eq('id','main').single(); if(!st.error&&st.data&&st.data.value){vectaMainSettingsLastPersisted=vectaSettingsSignature(st.data.value);app.settings=merge(app.settings,st.data.value)}}catch(e){}"
if old_main not in text: raise SystemExit('main settings pull not found')
text=text.replace(old_main,new_main,1)
text=text.replace("var res=await remoteClient.from('workshop_settings').upsert({id:'main',value:app.settings,updated_at:new Date().toISOString()},{onConflict:'id'});if(res&&res.error)throw res.error","var ok=await persistMainSettings();if(!ok)throw new Error('Main settings cloud save failed')")
text=text.replace("try{await remoteClient.from('workshop_settings').upsert({id:'main',value:app.settings,updated_at:new Date().toISOString()})}\n        catch(e){console.warn('Background settings sync failed',e)}","try{await persistMainSettings()}\n        catch(e){console.warn('Background settings sync failed',e)}")

old_mot="async function persistFleetMotAuthority(){if(!remoteClient)return false;try{var stamp=new Date().toISOString(),res=await remoteClient.from('workshop_settings').upsert({id:FLEET_MOT_AUTHORITY_CLOUD_ID,value:{version:260,records:fleetMotAuthority||{},updated_at:stamp},updated_at:stamp},{onConflict:'id'});if(res.error)throw res.error;return true}catch(e){console.warn('MOT authority cloud save failed',e);return false}}"
new_mot="var fleetMotAuthorityLastPersisted='';\nasync function persistFleetMotAuthority(){if(!remoteClient)return false;try{var sig=vectaSettingsSignature(fleetMotAuthority||{});if(sig===fleetMotAuthorityLastPersisted)return true;var stamp=new Date().toISOString(),res=await remoteClient.from('workshop_settings').upsert({id:FLEET_MOT_AUTHORITY_CLOUD_ID,value:{version:260,records:fleetMotAuthority||{},updated_at:stamp},updated_at:stamp},{onConflict:'id'});if(res.error)throw res.error;fleetMotAuthorityLastPersisted=sig;return true}catch(e){console.warn('MOT authority cloud save failed',e);return false}}"
if old_mot not in text: raise SystemExit('Fleet MOT persistence not found')
text=text.replace(old_mot,new_mot,1)

old_fleet="async function persistFleetCloudSnapshot(){if(!remoteClient)return false;try{var snap=fleetSnapshot(),res=await remoteClient.from('workshop_settings').upsert({id:fleetCloudStateId,value:snap,updated_at:snap.updated_at},{onConflict:'id'});if(res.error)throw res.error;try{localStorage.setItem('vecta:fleet:cloud-updated:v77',snap.updated_at)}catch(e){}return true}catch(e){console.warn('Fleet cloud snapshot save failed',e);return false}}"
new_fleet="""var fleetCloudLastPersistedPayload='';
function fleetCloudPersistenceValue(snap){return {version:snap.version,vehicles:snap.vehicles,plans:snap.plans,completions:snap.completions,customers:snap.customers,deletedRegistrations:snap.deletedRegistrations,removedMaintenance:snap.removedMaintenance}}
async function persistFleetCloudSnapshot(){if(!remoteClient)return false;try{var snap=fleetSnapshot(),sig=vectaSettingsSignature(fleetCloudPersistenceValue(snap));if(sig===fleetCloudLastPersistedPayload)return true;var res=await remoteClient.from('workshop_settings').upsert({id:fleetCloudStateId,value:snap,updated_at:snap.updated_at},{onConflict:'id'});if(res.error)throw res.error;fleetCloudLastPersistedPayload=sig;try{localStorage.setItem('vecta:fleet:cloud-updated:v77',snap.updated_at)}catch(e){}return true}catch(e){console.warn('Fleet cloud snapshot save failed',e);return false}}"""
if old_fleet not in text: raise SystemExit('Fleet cloud persistence not found')
text=text.replace(old_fleet,new_fleet,1)

old_auth="if(authority&&authority.value&&authority.value.records){var remoteRecords=authority.value.records||{};Object.keys(remoteRecords).forEach"
new_auth="if(authority&&authority.value&&authority.value.records){var remoteRecords=authority.value.records||{};fleetMotAuthorityLastPersisted=vectaSettingsSignature(remoteRecords);Object.keys(remoteRecords).forEach"
if old_auth not in text: raise SystemExit('Fleet authority pull not found')
text=text.replace(old_auth,new_auth,1)
old_state="if(state&&state.value){applyFleetCloudSnapshot(Object.assign({},state.value,{updated_at:state.updated_at||state.value.updated_at||''}));return true}"
new_state="if(state&&state.value){fleetCloudLastPersistedPayload=vectaSettingsSignature(fleetCloudPersistenceValue(state.value));applyFleetCloudSnapshot(Object.assign({},state.value,{updated_at:state.updated_at||state.value.updated_at||''}));return true}"
if old_state not in text: raise SystemExit('Fleet state pull not found')
text=text.replace(old_state,new_state,1)

old_upsert="""async function upsertRemote(table,row,options){
  options=options||{};
  if(!remoteClient||!navigator.onLine){if(!options.skipQueue)return queueRemoteOperation('upsert',table,Object.assign({},row));throw new Error('Supabase is not connected.');}
  if(table==='jobs'){var guard=await vectaGuardJobUpsert(row,options);if(!guard.allow)return [{id:String(row&&row.id||''),vecta_conflict_skipped:true}];}"""
new_upsert="""async function upsertRemote(table,row,options){
  options=options||{};
  if(table==='jobs'&&row&&row.id&&!isUuid(String(row.id))){console.warn('Legacy imported job retained locally; skipped invalid UUID cloud write',row.id);return [{id:String(row.id),vecta_legacy_local_only:true}];}
  if(!remoteClient||!navigator.onLine){if(!options.skipQueue)return queueRemoteOperation('upsert',table,Object.assign({},row));throw new Error('Supabase is not connected.');}
  if(table==='jobs'){var guard=await vectaGuardJobUpsert(row,options);if(!guard.allow)return [{id:String(row&&row.id||''),vecta_conflict_skipped:true}];}"""
if old_upsert not in text: raise SystemExit('upsertRemote header not found')
text=text.replace(old_upsert,new_upsert,1)

old_batch="var batch=rows.slice(i,i+50).map(function(j){var x=Object.assign({},j);delete x.booking_source;return x});"
new_batch="var batch=rows.slice(i,i+50).filter(function(j){return j&&j.id&&isUuid(String(j.id))}).map(function(j){var x=Object.assign({},j);delete x.booking_source;return x});if(!batch.length)continue;"
if old_batch not in text: raise SystemExit('contractor batch not found')
text=text.replace(old_batch,new_batch,1)

text=text.replace("""  function onFleetOpen(){
    var changed=repairCompletedHistory();
    refreshDueMots().then(function(n){if(n&&typeof render==='function'&&view==='fleet')render();});
    return changed;
  }""","""  function onFleetOpen(){return repairCompletedHistory();}
""",1)
text=text.replace("""  function runWhenFleetOpens(){
    reconcile(false).then(function(r){
      if((r.changed||0)>0 && typeof render==='function' && typeof view!=='undefined' && view==='fleet')render();
    });
  }""","""  function runWhenFleetOpens(){return;}
""",1)
text=text.replace("""function v254RunOnFleetOpen(){
  if(Date.now()-v254LastOpenRun<30000)return;
  v254LastOpenRun=Date.now();
  v254Reconcile({manual:false}).then(function(r){
    if(r.changed&&typeof render==='function'&&typeof view!=='undefined'&&view==='fleet')render();
  });
}""","""function v254RunOnFleetOpen(){return;}
""",1)

marker='<!-- VECTA IO-GUARD 2026-09-04: realtime row merge, idempotent settings, legacy UUID protection -->'
if marker not in text: text=text.replace('<head>','<head>\n  '+marker,1)

if text==original: raise SystemExit('No code changes made')
path.write_text(text,encoding='utf-8')

assert "table:'workshop_settings'},scheduleCloudRefresh" not in text
assert 'function scheduleCloudRefresh(payload)' in text
assert 'vectaReconcileJobsFromCloud([row])' in text
assert 'persistMainSettings' in text
assert 'fleetMotAuthorityLastPersisted' in text
assert 'fleetCloudLastPersistedPayload' in text
assert 'vecta_legacy_local_only' in text
assert "filter(function(j){return j&&j.id&&isUuid(String(j.id))})" in text
assert "table:'jobs'},scheduleCloudRefresh" in text
assert "table:'tasks'},scheduleCloudRefresh" in text
assert 'fleetRunManualMotCheck=v255Manual' in text
assert marker in text
print('VECTA IO patch verified')
