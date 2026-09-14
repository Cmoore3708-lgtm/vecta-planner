(function(root){
  'use strict';
  var RESTORE_DAYS=30;
  function isVoid(invoice){return String(invoice&&invoice.status||'').trim().toLowerCase()==='void'}
  function isActive(invoice){return !!invoice&&!isVoid(invoice)}
  function voidAgeDays(invoice,now){
    var stamp=new Date(invoice&&invoice.updated_at||0).getTime();
    var current=now===undefined?Date.now():Number(now);
    return isFinite(stamp)&&stamp>0?Math.floor((current-stamp)/(24*60*60*1000)):RESTORE_DAYS;
  }
  function canRestore(invoice,now){return isVoid(invoice)&&voidAgeDays(invoice,now)<RESTORE_DAYS}
  root.VectaInvoiceRules={RESTORE_DAYS:RESTORE_DAYS,isVoid:isVoid,isActive:isActive,voidAgeDays:voidAgeDays,canRestore:canRestore};
})(typeof window!=='undefined'?window:globalThis);
