import '../public/js/vecta-invoice-print.js';
import { invoiceBrandLogo } from './_invoice-brand.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => '£' + Number(value || 0).toFixed(2);
export function renderCustomerInvoiceHtml(savedInvoice, settings = {}, job = {}, presentation = {}) {
  let inv = savedInvoice;
  const account = String(inv.fleet_customer || inv.customer_account || job.customer_account || (inv.lines || []).find(l => l.invoice_customer_account)?.invoice_customer_account || '').toUpperCase();
  const tax = inv.source === 'vehicle_tax_eom' || inv.registration === 'NMUK TAX' || /^Vehicle tax\b/i.test(inv.vehicle || '');
  const staffInvoice = account === 'STAFF' && !tax;
  // Match the existing workshop print correction for legacy standalone MOT fees.
  if (staffInvoice && (inv.lines || []).some(l => /^(?:M\.?O\.?T\.?)(?:\s+(?:test(?:\s+fee)?|re[ -]?test|fee))?(?:\s*\([^)]*\))?\.?$/i.test(String(l.description || '').trim().replace(/\s+/g,' ')) && l.vat_mode !== 'no_vat')) {
    const rate = Number(settings.vatRate || 20) / 100;
    const lines = inv.lines.map(l => /^(?:M\.?O\.?T\.?)(?:\s+(?:test(?:\s+fee)?|re[ -]?test|fee))?(?:\s*\([^)]*\))?\.?$/i.test(String(l.description || '').trim().replace(/\s+/g,' ')) ? {...l,vat_mode:'no_vat'} : l);
    const totals = lines.reduce((t,l) => {const a=Number(l.amount || 0);if(l.vat_mode==='inc_vat'){t.total+=a;t.subtotal+=a/(1+rate);t.vat+=a-a/(1+rate);}else if(l.vat_mode==='ex_vat'){t.subtotal+=a;t.vat+=a*rate;t.total+=a*(1+rate);}else{t.subtotal+=a;t.total+=a;}return t;},{subtotal:0,vat:0,total:0});
    inv = {...inv,...totals,lines};
  }
  const isFleet = !!(inv.fleet_customer || inv.fleet_month || inv.eom_month || inv.source === 'fleet_eom' || tax || inv.registration === 'FLEET ACCOUNT');
  const nmuk = account === 'NMUK' || inv.registration === 'NMUK TAX';
  const address = inv.customer_address || inv.lines?.[0]?.customer_address || '';
  const customer = '<div class="printCustomerTop"><b>Customer Details</b>' + esc(inv.customer_name || '') + (address ? '<div class="printCustomerAddress">' + esc(address).replace(/\n/g, '<br>') + '</div>' : '') + (inv.customer_phone ? '<br>' + esc(inv.customer_phone) : '') + '</div>';
  const vatRate = Number(settings.vatRate || 20) / 100;
  const rows = (inv.lines || []).map(l => {
    const amount = staffInvoice && l.vat_mode === 'inc_vat' ? Number(l.amount || 0) / (1 + vatRate) : Number(l.amount || 0);
    return '<tr><td>' + esc(l.description || '') + '</td><td class="right">' + money(amount) + '</td><td>' + esc(staffInvoice ? l.vat_mode === 'no_vat' ? 'No VAT' : 'Ex VAT' : l.vat_mode || '') + '</td></tr>';
  }).join('');
  const lines = nmuk ? ['10 Hunter Close','East Boldon','Tyne and Wear','NE36 0TB','Email: shirken.moore@talktalk.net','Tel: 07721722622','VAT No. 169170002'] : ['Contractors Compound','Nissan Motor Manufacturing','Nissan Way, Washington, SR5 3NS','Tel: 07721722622','VAT No. 169170002'];
  const senderHtml = '<img class="vectaBrandLogo printBrandLogo" src="' + invoiceBrandLogo + '" alt="VECTA Vehicle Servicing and repairs"><b>' + esc(settings.businessName || 'Vecta Motors') + '</b><br>' + lines.map(esc).join('<br>');
  const month = String(inv.eom_month || inv.fleet_month || inv.invoice_date || '').slice(0,7);
  const accountHeading = tax ? '<div class="printInvoiceAccountTitle">' + esc(/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? 'Vehicle tax ' + new Date(month+'-01T12:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric'}) : inv.vehicle || 'Vehicle tax') + '</div>' : '';
  const plateHtml = '<span class="invoiceUkPlate printInvoicePlate"><span class="invoiceUkStrip">GB</span><b>' + esc(String(inv.registration || 'NO REG').toUpperCase().replace(/\s/g,'')) + '</b></span>';
  let markup = globalThis.VectaInvoicePrint.render({ inv, staffInvoice, isFleet, rows, customer, mileage:inv.mileage ?? job.mileage ?? '', motDue:inv.mot_due || job.mot_due || '', senderHtml, accountHeading, plateHtml, settings });
  // Artwork metadata is signed by the server when the manager issues the link.
  // Customer viewing never queues a fresh vehicle lookup.
  const image = presentation.imageUrl || '';
  if (!isFleet && /^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(image)) {
    const picture = '<div class="haynesInvoiceHeaderVehicle"><img class="haynesInvoiceImage" data-vehicle-image data-vehicle-logo="separate" src="' + esc(image) + '" data-registration="' + esc(inv.registration) + '" data-colour="' + esc(presentation.colour || '') + '" alt="' + esc(inv.vehicle || 'Vehicle') + '"></div>';
    markup = markup.replace('<div class="printTitle">', picture + '<div class="printTitle">');
  }
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VECTA Invoice ' + esc(inv.invoice_number) + '</title><link rel="stylesheet" href="/js/vecta-customer-invoice.css"></head><body><nav class="invoiceActions"><button id="printInvoice">Print / Save PDF</button></nav><main class="printSheet">' + markup + '</main><script src="/js/vecta-vehicle-image.js"></script><script src="/js/vecta-customer-invoice.js"></script></body></html>';
}
