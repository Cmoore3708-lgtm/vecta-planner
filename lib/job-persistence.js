export const JOB_CONFLICT_IGNORED_FIELDS = new Set(['updated_at','created_at']);

export function sameJobValue(a,b,key=''){
  if(key==='drop_time') return String(a||'').slice(0,5)===String(b||'').slice(0,5);
  const left=a===null||a===undefined?'':a;
  const right=b===null||b===undefined?'':b;
  if(typeof left==='string'||typeof right==='string') return String(left).trim()===String(right).trim();
  return left===right;
}

export function jobChangedFields(before={},after={}){
  const keys=new Set([...Object.keys(before),...Object.keys(after)]);
  return [...keys].filter(key=>!JOB_CONFLICT_IGNORED_FIELDS.has(key)&&!sameJobValue(before[key],after[key],key));
}

export function mergeJobDraft({baseline,remote,draft}){
  if(!baseline||!remote||!draft) return {ok:false,reason:'missing_baseline'};
  const remoteChanges=jobChangedFields(baseline,remote);
  const localChanges=jobChangedFields(baseline,draft);
  const conflicts=remoteChanges.filter(key=>localChanges.includes(key)&&!sameJobValue(remote[key],draft[key],key));
  if(conflicts.length) return {ok:false,reason:'conflict',conflicts,remote};
  const row={...remote};
  for(const key of localChanges) row[key]=draft[key];
  delete row.updated_at;
  return {ok:true,row,remoteChanges,localChanges};
}
