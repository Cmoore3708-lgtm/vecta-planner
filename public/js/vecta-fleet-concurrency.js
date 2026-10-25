(function(root){
  'use strict';
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  function same(a,b){
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
    return ak.length===bk.length&&ak.every((k,i)=>k===bk[i]&&same(a[k],b[k]));
  }
  function conflict(path){const e=Error('Fleet changed on another device at '+path+'. Your edit is kept on this device; review it before retrying.');e.code='FLEET_CONFLICT';throw e;}
  function merge(base,local,remote,path='fleet'){
    if(same(local,base))return clone(remote);
    if(same(remote,base)||same(local,remote))return clone(local);
    if(path.endsWith('.updated_at'))return String(local||'')>String(remote||'')?clone(local):clone(remote);
    // Plan notes are descriptive and are also rewritten by automatic repairs.
    // Preserve both concurrent texts; dates, status and deletions still use the
    // strict conflict checks below. Split our own separator to avoid growth
    // when an older phone retries an already-combined note.
    if(/^fleet\.plans\.[^.]+\.notes$/.test(path)&&
       [base,local,remote].every(v=>v==null||typeof v==='string')&&
       typeof local==='string'&&typeof remote==='string'&&local&&remote){
      const separator='\n\n[Also recorded]\n';
      return [...new Set([...remote.split(separator),...local.split(separator)])].join(separator);
    }
    const lists=[base,local,remote];
    if(lists.every(Array.isArray)&&lists.every(a=>a.every(v=>v&&typeof v==='object'&&v.id!=null)&&new Set(a.map(v=>String(v.id))).size===a.length)){
      const maps=lists.map(a=>new Map(a.map(v=>[String(v.id),v]))),out=[];
      for(const key of new Set([...maps[2].keys(),...maps[1].keys(),...maps[0].keys()])){
        const v=merge(maps[0].get(key),maps[1].get(key),maps[2].get(key),path+'.'+key);if(v!==undefined)out.push(v);
      }
      return out;
    }
    if(lists.every(v=>v&&typeof v==='object'&&!Array.isArray(v))){
      const out={};
      for(const key of new Set(lists.flatMap(Object.keys))){
        const v=merge(base[key],local[key],remote[key],path+'.'+key);if(v!==undefined)out[key]=v;
      }
      return out;
    }
    return conflict(path);
  }
  async function save(client,{id,base,desired,baseRevision=null}){
    if(!base)throw Error('Fleet must finish its cloud download before changes can be synced. Your edit remains on this device.');
    for(let attempt=0;attempt<3;attempt++){
      // A confirmed baseline with the exact database revision needs only a tiny
      // revision read. Any mismatch (including an older client's write) falls
      // back to the complete three-way merge. The conditional write still wins
      // or loses atomically if another device changes the row after this read.
      let read=await client.from('workshop_settings').select(baseRevision?'id,updated_at':'id,value,updated_at').eq('id',id).maybeSingle();
      if(read.error)throw read.error;
      let row=read.data,remote;
      if(baseRevision&&row?.updated_at===baseRevision)remote=base;
      else{
        if(baseRevision){read=await client.from('workshop_settings').select('id,value,updated_at').eq('id',id).maybeSingle();if(read.error)throw read.error;row=read.data;}
        remote=row?.value||{};
      }
      const value=merge(base,desired,remote);value.updated_at=new Date().toISOString();
      let result;
      if(row){
        let update=client.from('workshop_settings').update({value,updated_at:value.updated_at}).eq('id',id);
        update=row.updated_at==null?update.is('updated_at',null):update.eq('updated_at',row.updated_at);
        result=await update.select('id,value,updated_at');
      }else result=await client.from('workshop_settings').insert({id,value,updated_at:value.updated_at}).select('id,value,updated_at');
      if(result.error){if(result.error.code==='23505')continue;throw result.error;}
      if(result.data?.length)return result.data[0];
    }
    return conflict('busy record');
  }
  root.VectaFleetConcurrency={merge,save,clone};
})(typeof window!=='undefined'?window:globalThis);
