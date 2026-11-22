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
  function bulkFuelAdjustment(invoice,start,end,netValue){
    var date=String(invoice.invoice_date||'').slice(0,10);
    if(invoice.job_id || invoice.fleet_month || (invoice.fleet_job_ids||[]).length ||
       String(invoice.customer_name||'').trim().toUpperCase()!=='NMUK' ||
       !isActive(invoice) || String(invoice.status||'').toLowerCase()==='draft' ||
       !date || date<start || date>end)return null;
    var value=netValue(invoice);
    return value===null?null:{date:date,amount:value,category:'Fuel',description:'NMUK Fleet – bulk fuel',invoice_number:invoice.invoice_number};
  }
  function nmukBreakdownRows(report,money,esc){
    var nmukCounts=report.nmukCounts,nmukTotals=report.nmukTotals;
    return ['Internal','Pool','MVOS','Various'].map(function(category){var count=nmukCounts[category];return '<tr><td><b>'+category+(category==='Various'?'':' cars')+'</b></td><td>'+count+' job'+(count===1?'':'s')+'</td><td class="right"><b>'+money(nmukTotals[category])+'</b></td><td class="right"><button type="button" class="financeViewLink" data-finance-scope="NMUK" data-finance-name="'+category+'">View jobs</button></td></tr>'}).join('')
      +report.adjustments.filter(function(row){return row.category==='Fuel'}).map(function(row){return '<tr><td><b>'+esc(row.description)+'</b> · '+esc(row.invoice_number)+'</td><td>0 jobs</td><td class="right"><b>'+money(row.amount)+'</b></td><td></td></tr>'}).join('');
  }
  root.VectaInvoiceRules={nmukBreakdownRows:nmukBreakdownRows,bulkFuelAdjustment:bulkFuelAdjustment,RESTORE_DAYS:RESTORE_DAYS,isVoid:isVoid,isActive:isActive,voidAgeDays:voidAgeDays,canRestore:canRestore};
})(typeof window!=='undefined'?window:globalThis);
