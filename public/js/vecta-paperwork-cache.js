(function(root){
 'use strict';
 const REF='vecta_paperwork_ref',validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 async function bodyHash(html){
  const bytes=new root.TextEncoder().encode(html),digest=await root.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
 }
 function create(options={}){
  const confirmed=new Map(),pending=new Map();let running=null,writing=new Map(),database=null;
  function open(){
   if(database)return database;
   database=new Promise((resolve,reject)=>{
    let settled=false;const finish=(error,db)=>{if(settled){db?.close();return;}settled=true;root.clearTimeout(timer);if(error)reject(error);else resolve(db);};
    const timer=root.setTimeout(()=>finish(Error('Paperwork storage took too long to open.')),2500);
    try{
     const request=root.indexedDB.open('vecta-workshop-paperwork-v1',1);
     request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('bodies'))request.result.createObjectStore('bodies',{keyPath:'hash'});};
     request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};finish(null,request.result);};
     request.onerror=()=>finish(request.error||Error('Paperwork storage is unavailable.'));
     request.onblocked=()=>finish(Error('Paperwork storage is blocked by another app window.'));
    }catch(error){finish(error);}
   }).catch(error=>{database=null;throw error;});
   return database;
  }
  async function transaction(mode,work){
   const db=await open();
   return new Promise((resolve,reject)=>{
    const tx=db.transaction('bodies',mode);let result;
    const timer=root.setTimeout(()=>{try{tx.abort();}catch{}reject(Error('Paperwork storage did not finish.'));},8000);
    tx.oncomplete=()=>{root.clearTimeout(timer);resolve(result);};
    tx.onerror=tx.onabort=()=>{root.clearTimeout(timer);reject(tx.error||Error('Paperwork storage failed.'));};
    try{result=work(tx.objectStore('bodies'));}catch(error){try{tx.abort();}catch{}root.clearTimeout(timer);reject(error);}
   });
  }
  const digest=options.digest||bodyHash;
  const writeBodies=options.writeBodies||(rows=>transaction('readwrite',store=>{for(const row of rows)store.put(row);}));
  const readBodies=options.readBodies||(hashes=>transaction('readonly',store=>{const bodies=new Map();for(const hash of hashes){const request=store.get(hash);request.onsuccess=()=>{if(request.result?.hash===hash&&typeof request.result.html==='string')bodies.set(hash,request.result.html);};}return bodies;}));
  function compact(records){
   return (records||[]).map(record=>{
    const saved=record&&confirmed.get(String(record.id||''));
    if(!record||typeof record.html!=='string'||!saved||saved.html!==record.html)return record;
    const metadata={...record,[REF]:saved.hash};delete metadata.html;return metadata;
   });
  }
  function persist(records){
   for(const record of records||[]){
    if(!record?.id||typeof record.html!=='string'||!record.html)continue;
    const id=String(record.id),html=record.html;
    if((!pending.has(id)&&!writing.has(id)&&confirmed.get(id)?.html===html)||pending.get(id)?.html===html||(!pending.has(id)&&writing.get(id)?.html===html))continue;
    pending.set(id,{id,html});
   }
   if(running)return running;
   if(!pending.size)return Promise.resolve();
   const task=Promise.resolve().then(async()=>{
    while(pending.size){
     const batch=[...pending.values()];pending.clear();writing=new Map(batch.map(row=>[row.id,row]));
     const rows=await Promise.all(batch.map(async row=>({...row,hash:await digest(row.html)})));
     if(rows.some(row=>!validHash(row.hash)))throw Error('Paperwork could not be checksummed.');
     const unique=new Map(rows.map(row=>[row.hash,{hash:row.hash,html:row.html}]));
     await writeBodies([...unique.values()]);
     // A reference may replace HTML only after the IDB transaction commits.
     for(const row of rows)confirmed.set(row.id,{hash:row.hash,html:row.html});
     writing.clear();
    }
    options.onPersisted?.();
   });
   running=task;
   task.finally(()=>{if(running===task)running=null;writing.clear();}).catch(()=>{});
   return task;
  }
  async function hydrate(records,{recover}={}){
   const needed=(records||[]).filter(record=>record&&record[REF]&&!record.html);
   if(!needed.length)return records||[];
   if(needed.some(record=>!validHash(record[REF])))throw Error('Saved paperwork has an invalid local reference.');
   const hashes=[...new Set(needed.map(record=>record[REF]))],bodies=new Map(),durable=new Set();
   for(const record of needed){const saved=confirmed.get(String(record.id||''));if(saved?.hash===record[REF])bodies.set(saved.hash,saved.html);}
   for(const hash of bodies.keys())durable.add(hash);
   const missing=hashes.filter(hash=>!bodies.has(hash));
   if(missing.length){try{for(const [hash,html] of await readBodies(missing))if(validHash(hash)&&typeof html==='string'&&await digest(html)===hash){bodies.set(hash,html);durable.add(hash);}}catch(error){if(!recover)throw error;}}
   const unrecovered=hashes.filter(hash=>!bodies.has(hash));
   if(unrecovered.length&&recover){const restored=await recover(needed.filter(record=>unrecovered.includes(record[REF])));for(const [hash,html] of restored)if(validHash(hash)&&typeof html==='string'&&await digest(html)===hash)bodies.set(hash,html);}
   if(hashes.some(hash=>!bodies.has(hash)))throw Error('Saved paperwork is unavailable on this device. Reconnect and retry; a new blank sheet has not been opened.');
   return (records||[]).map(record=>{
    if(!record?.[REF]||record.html)return record;
    const html=bodies.get(record[REF]);if(durable.has(record[REF]))confirmed.set(String(record.id||''),{hash:record[REF],html});return {...record,html};
   });
  }
  return {compact,persist,hydrate};
 }
 root.VectaPaperworkCache={create,bodyHash,reference:REF};
})(typeof window==='undefined'?globalThis:window);
