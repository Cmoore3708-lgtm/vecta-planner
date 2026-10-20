(function(root){
  'use strict';
  function normalise(value){return String(value||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();}
  function reg(job){return String(job&&job.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function items(job){
    var match=String(job&&job.customer_note||'').match(/\[\[VECTA_PRIVATE_PRICING:([^\]]+)\]\]/),rows=[];
    try{if(match)rows=JSON.parse(decodeURIComponent(match[1]));}catch(e){}
    return (Array.isArray(rows)&&rows.length?rows:[{description:job&&job.work_required,price:job&&job.amount_quoted}]).map(function(x){return {description:String(x.description||''),price:Number(x.price||0)};});
  }
  function similar(a,b){
    a=normalise(a);b=normalise(b);if(!a||!b)return false;if(a===b)return true;
    if(/\bservice\b/.test(a)&&/\bservice\b/.test(b))return true;
    var stop=['and','the','a','to','of','on','new','supply','fit','repair','replace','work','check','inspection'];
    var left=a.split(' ').filter(function(x){return stop.indexOf(x)<0;}),right=b.split(' ').filter(function(x){return stop.indexOf(x)<0;});
    var common=left.filter(function(x){return right.indexOf(x)>=0;});
    return common.length>=2&&common.length/Math.max(left.length,right.length)>=0.65;
  }
  function overlaps(a,b){
    if(!reg(a)||reg(a)!==reg(b)||String(a.id)===String(b.id))return [];
    var da=Date.parse(a.completed_at||a.booking_date||''),db=Date.parse(b.completed_at||b.booking_date||'');
    if(!Number.isFinite(da)||!Number.isFinite(db)||Math.abs(da-db)>31*86400000)return [];
    var matches=[];items(a).forEach(function(x){items(b).forEach(function(y){if(similar(x.description,y.description))matches.push({left:x,right:y});});});
    // Service templates and manually priced service descriptions can use different words.
    if(!matches.length&&/service/i.test(a.job_type||'')&&/service/i.test(b.job_type||''))matches.push({left:{description:a.job_type},right:{description:b.job_type}});
    return matches;
  }
  function signature(a,b){return JSON.stringify([a,b].sort(function(x,y){return String(x.id).localeCompare(String(y.id));}).map(function(j){return [j.id,j.registration,j.completed_at,j.booking_date,j.job_type,j.work_required,j.amount_quoted,items(j)];}));}
  root.VectaBillingIntegrity=Object.freeze({items:items,overlaps:overlaps,signature:signature});
})(typeof window!=='undefined'?window:globalThis);
