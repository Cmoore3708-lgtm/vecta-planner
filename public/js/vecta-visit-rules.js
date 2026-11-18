(function(root){
  'use strict';
  const labels={scheduled:'Expected',missing:'Awaiting arrival',waiting:'On site · waiting',underway:'In the workshop',checking:'Work finished · final checks',due:'Complete · awaiting payment',paid:'Paid · awaiting collection',ready:'Ready for collection',collected:'Collected'};
  const normal=value=>String(value||'').trim().toLowerCase();
  const plate=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  function invoiceState(invoice,job){
    if(!invoice||!job||invoice.job_id!==job.id||!plate(job.registration)||plate(invoice.registration)!==plate(job.registration)||invoice.fleet_customer||invoice.eom_month||['fleet_eom','vehicle_tax_eom'].includes(invoice.source))return null;
    const status=normal(invoice.status);
    if(['draft','void','cancelled','canceled','deleted','refunded'].includes(status))return null;
    if(['part_paid','part_refunded'].includes(status))return 'due';
    return status==='paid'||['card','cash','bacs'].includes(normal(invoice.payment_method))?'paid':'due';
  }
  function state(job,{today,billing=job.visit_billing,staff=true}={}){
    if(job.booking_date>today)return 'scheduled';
    if(job.visit_presence_date===job.booking_date&&job.visit_presence==='collected')return 'collected';
    if(billing==='paid'||billing==='due')return staff?billing:'ready';
    const status=normal(job.status);
    if(['completed','invoiced','invoice_created','ready_to_invoice'].includes(status))return staff?'checking':'ready';
    if(status==='work_complete')return 'checking';
    if(['in_progress','in progress'].includes(status))return 'underway';
    if(job.visit_presence_date===job.booking_date&&job.visit_presence==='missing')return 'missing';
    return 'waiting';
  }
  function invoiceMessage(body,invoice,job){
    const billing=invoiceState(invoice,job||{id:invoice.job_id,registration:invoice.registration});
    const collected=job&&job.visit_presence==='collected'&&job.visit_presence_date===job.booking_date;
    body=body.replace('We have completed the work on your car.',collected?'Your car has been collected.':'Work is complete and your car is ready to collect.');
    return billing==='paid'?body.replace('We will send a payment link from BeePaid via text message shortly…','Your invoice has been paid.'):body;
  }
  const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
  root.VectaVisitRules={labels,state,invoiceState,invoiceMessage,today:()=>dayFormat.format(new Date())};
})(globalThis);
