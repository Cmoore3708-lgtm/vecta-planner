(function(root){
 'use strict';
 function createReader({getClient,getReadState=()=>({writing:true}),pageSize=1000,maxRows=100000}){
  const clients=new WeakMap();
  async function download(client,table,timeoutMs){
   const controller=new AbortController();let timer;
   const work=(async()=>{
    const all=[],seen=new Set();let lastId;
    while(true){
     if(controller.signal.aborted)throw Error('Cloud '+table+' download timed out.');
     // A stable primary-key cursor avoids skipping rows when an earlier page's
     // records are deleted. Never reconcile an incomplete or malformed download.
     let query=client.from(table).select('*').order('id',{ascending:true}).limit(pageSize);
     if(lastId!==undefined)query=query.gt('id',lastId);
     const result=await query.abortSignal(controller.signal);
     if(result.error)throw result.error;
     if(!Array.isArray(result.data))throw Error('Invalid cloud '+table+' response');
     for(const row of result.data){
      if(row?.id==null||seen.has(String(row.id)))throw Error('Invalid cloud '+table+' record identity');
      seen.add(String(row.id));all.push(row);
      if(all.length>maxRows)throw Error('Safety limit reached while downloading '+table);
     }
     if(result.data.length<pageSize)return all;
     lastId=result.data[result.data.length-1].id;
    }
   })();
   try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Cloud '+table+' download timed out.'));},timeoutMs);})]);}
   finally{clearTimeout(timer);controller.abort();}
  }
  return async function read(table,timeoutMs=25000){
   const client=getClient();if(!client)throw Error('Cloud connection is unavailable.');
   const state=getReadState(),key=table+'|'+timeoutMs;
   let entries=clients.get(client);if(!entries){entries=new Map();clients.set(client,entries);}
   let entry=entries.get(key);
   if(state.writing||!entry||entry.version!==state.version){
    entry={version:state.version,promise:download(client,table,timeoutMs)};
    if(!state.writing)entries.set(key,entry);
   }
   try{
    // Each caller owns its rows: reconciliation must not mutate another caller's
    // copy. Only running requests are shared; completed results are never cached.
    const rows=await entry.promise;return JSON.parse(JSON.stringify(rows));
   }finally{if(entries.get(key)===entry)entries.delete(key);}
  };
 }
 root.VectaCloudReads={createReader};
})(typeof window==='undefined'?globalThis:window);
