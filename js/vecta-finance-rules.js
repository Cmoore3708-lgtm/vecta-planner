(function(root){
  'use strict';

  function statusKey(job){
    return String(job&&job.status||'').trim().toLowerCase().replace(/[ -]+/g,'_');
  }

  function hasQuotedAmount(job){
    var value=job&&job.amount_quoted;
    return value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
  }

  root.VectaFinanceRules=Object.freeze({
    statusKey:statusKey,
    hasQuotedAmount:hasQuotedAmount
  });
})(typeof window!=='undefined'?window:globalThis);
