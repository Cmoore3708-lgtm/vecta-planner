(function(root){
  'use strict';

  function normaliseQueuedItem(value){
    var item=value&&typeof value==='object'?Object.assign({},value):{};
    if(!item.operation&&item.type)item.operation=item.type;
    if(!item.payload&&item.rows)item.payload=Array.isArray(item.rows)&&item.rows.length===1?item.rows[0]:item.rows;
    if(item.operation==='delete'&&item.payload===undefined&&item.id!==undefined)item.payload=item.id;
    if(!item.key)item.key=String(item.operation||'unknown')+':'+String(item.table||'unknown')+':'+String((item.payload&&item.payload.id)||item.payload||item.id||'');
    return item;
  }

  function completionStampIsSynthetic(value){return /T(?:12|17):00:00(?:\.000)?Z$/i.test(String(value||''))}
  function chooseCompletionStamp(left,right){
    var a=String(left||'').trim(),b=String(right||'').trim();
    if(!a)return b;if(!b)return a;if(a===b)return a;
    var aSynthetic=completionStampIsSynthetic(a),bSynthetic=completionStampIsSynthetic(b);
    if(aSynthetic!==bSynthetic)return aSynthetic?b:a;
    var aTime=Date.parse(a),bTime=Date.parse(b);
    if(Number.isFinite(aTime)&&Number.isFinite(bTime))return aTime<=bTime?a:b;
    return a;
  }

  root.VectaOfflineSyncRules=Object.freeze({
    normaliseQueuedItem:normaliseQueuedItem,
    completionStampIsSynthetic:completionStampIsSynthetic,
    chooseCompletionStamp:chooseCompletionStamp
  });
})(typeof window!=='undefined'?window:globalThis);
