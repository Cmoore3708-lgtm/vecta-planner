(function(root){
  'use strict';
  function finished(job){return ['ready_to_invoice','ready_for_invoice','ready','completed','complete','invoiced','invoice_created'].indexOf(String(job&&job.status||'').toLowerCase())>=0}
  function shouldNotify(job,previous){var account=String(job&&job.customer_account||'').toUpperCase();if(account&&account!=='STAFF'&&account!=='NMUK')return false;return !!job&&finished(job)&&!finished(previous)&&!job.no_vehicle&&!job.mini_task&&String(job.card_type||'')!=='mini_task'&&String(job.registration||'').trim()!==''&&String(job.job_type||'').toLowerCase()!=='vehicle tax'}
  function emails(value){return (String(value||'').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/ig)||[]).filter(function(value,index,list){return list.findIndex(function(email){return email.toLowerCase()===value.toLowerCase()})===index})}
  function phone(value){
    var raw=String(value||'').trim().replace(/^(\+44|0044)\s*\(0\)/,'$1');if(!raw||/[A-Za-z]/.test(raw))return '';
    var number=raw.replace(/[^0-9]/g,'');if(raw.indexOf('00')===0)number=number.slice(2);
    if(number.indexOf('0')===0){if(number.length!==11)return '';number='44'+number.slice(1)}
    // Accept explicit international numbers; never guess a country for short numbers.
    if(number.indexOf('44')===0&&number.length===12)return number;
    return /^(?:\+|00)/.test(raw)&&number.length>=8&&number.length<=15&&number[0]!=='0'?number:'';
  }
  function plan(job,previous,fleet,customer){
    if(!shouldNotify(job,previous))return null;fleet=fleet||{};customer=customer||{};
    var account=String(job.customer_account||fleet.account||'').toUpperCase();
    var nmuk=account==='NMUK',subtype=String(job.nmuk_vehicle_type||fleet.subtype||'').toLowerCase();
    if(account!=='STAFF'&&!(nmuk&&['internal','pool','pool car','pool cars','nissan internal','nissan pool cars'].indexOf(subtype)>=0))return null;
    var address=[fleet.email,job.customer_email,customer.email].map(emails).find(function(list){return list.length})||[];
    if(nmuk&&!address.length)return null;
    var number=nmuk?'':[fleet.phone,job.customer_phone,customer.phone].map(phone).find(Boolean)||'';
    var name=String(nmuk?(fleet.name||job.customer_name||customer.name||''):(job.customer_name||customer.name||fleet.name||'')).trim();
    if(/^(NMUK|Staff|Internal|Pool)$/i.test(name))name='';
    var first=name.split(/\s+/)[0]||'',greeting='Hi'+(first?' '+first:'')+'.';
    var reg=String(job.registration||'').toUpperCase().trim(),subject=reg+' — work complete';
    var body=greeting+'\n\nThe work on your car '+reg+' is complete';
    if(nmuk)body+=' and it is ready to collect from our workshop.';
    else{
      var total=Number(fleet.invoiceTotal);
      if(fleet.invoiceTotal===null||fleet.invoiceTotal===undefined||!Number.isFinite(total))return {channel:'missing',recipient:'',url:'',reason:'The invoice total could not be confirmed. Please contact the customer directly.'};
      body+='. The total price is £'+total.toFixed(2)+'. I will send you a payment link shortly.';
    }
    body+='\n\nKind regards,\nChris\nVECTA Motors\n07721 722622\nwww.vectamotors.co.uk';
    if(number)return {channel:'whatsapp',recipient:number,url:'https://wa.me/'+number+'?text='+encodeURIComponent(body)};
    if(address.length)return {channel:'email',recipient:address.join(','),url:'mailto:'+address.map(encodeURIComponent).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)};
    return {channel:'missing',recipient:'',url:''};
  }
  root.VectaCompletionContact=Object.freeze({shouldNotify:shouldNotify,phone:phone,plan:plan});
})(typeof window!=='undefined'?window:globalThis);
