// One invoice print template, shared by workshop printing and customer links.
(function(root){
  function render(o){
    const {inv,staffInvoice,isFleet,rows,customer,mileage,motDue,senderHtml,accountHeading,plateHtml,settings}=o;
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=value=>'£'+Number(value||0).toFixed(2);
    const niceDate=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    return '<div class="invoicePrintPage"><div class="invoicePrintHeader"><div>'+senderHtml+'</div><div class="printTitle">INVOICE'+accountHeading+'<br><span>'+esc(inv.invoice_number||'')+'</span><br><small>'+esc(inv.invoice_date||'')+'</small>'+customer+'</div></div>'+(isFleet?'':'<div class="printInvoiceVehicle"><div class="printVehicleCell"><h3>Registration</h3>'+plateHtml+'</div><div class="printVehicleCell"><h3>Vehicle</h3><b>'+esc(inv.vehicle||'Not recorded')+'</b></div><div class="printVehicleCell"><h3>Mileage</h3><b>'+esc(mileage!==''&&mileage!==null&&mileage!==undefined?String(mileage)+' miles':'Not recorded')+'</b></div><div class="printVehicleCell"><h3>Next MOT due</h3><b>'+esc(motDue?niceDate(String(motDue).slice(0,10)):'Not recorded')+'</b></div></div>')+'<table class="printTable invoiceWorkPrint"><tr><th>Work</th><th>'+(staffInvoice?'Amount (ex VAT)':'Amount')+'</th><th>VAT</th></tr>'+rows+'</table><div class="printTotals noBreak printTotalsGrid"><div><b>Subtotal:</b><span>'+money(inv.subtotal||0)+'</span></div><div><b>VAT:</b><span>'+money(inv.vat||0)+'</span></div><div><b>Total:</b><span>'+money(inv.total||0)+'</span></div></div><div class="printPayment noBreak"><div><b>Bank:</b> '+esc(settings.bankName||'')+' &nbsp; <b>Account Name:</b> '+esc(settings.accountName||'Vecta Motors')+' &nbsp; <b>Account Number:</b> '+esc(settings.accountNumber||'')+' &nbsp; <b>Sort Code:</b> '+esc(settings.sortCode||'')+' &nbsp; <b>Reference:</b> '+esc(inv.registration||'Registration number')+'</div></div></div>';
  }
  root.VectaInvoicePrint={render};
})(globalThis);
