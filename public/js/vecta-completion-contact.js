(function(root){
  'use strict';
  function finished(job){return ['ready_to_invoice','ready_for_invoice','ready','completed','complete','invoiced','invoice_created'].indexOf(String(job&&job.status||'').toLowerCase())>=0}
  function shouldNotify(job,previous){return !!job&&finished(job)&&!finished(previous)&&!job.no_vehicle&&!job.mini_task&&String(job.card_type||'')!=='mini_task'&&String(job.registration||'').trim()!==''&&String(job.job_type||'').toLowerCase()!=='vehicle tax'}
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
    var address=[fleet.email,job.customer_email,customer.email].map(emails).find(function(list){return list.length})||[];
    var number=[fleet.phone,job.customer_phone,customer.phone].map(phone).find(Boolean)||'';
    var reg=String(job.registration||'').toUpperCase().trim(),subject=reg+' — work complete';
    var body='Hi,\n\nThe work on your vehicle '+reg+' is now complete. Please contact us to arrange collection.\n\nKind regards,\nChris\nVECTA Motors\n07721 722622\nwww.vectamotors.co.uk';
    if(address.length)return {channel:'email',recipient:address.join(','),url:'mailto:'+address.map(encodeURIComponent).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)};
    if(number)return {channel:'whatsapp',recipient:number,url:'https://wa.me/'+number+'?text='+encodeURIComponent(body)};
    return {channel:'missing',recipient:'',url:''};
  }
  root.VectaCompletionContact=Object.freeze({shouldNotify:shouldNotify,phone:phone,plan:plan});
})(typeof window!=='undefined'?window:globalThis);
