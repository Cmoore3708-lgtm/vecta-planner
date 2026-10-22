import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderCustomerInvoiceHtml } from './_invoice-html.js';
import { databaseEnvironment } from './_database-environment.js';
import { managerGate, validManagerSession } from '../middleware.js';

const LINK_SECONDS = 90 * 24 * 60 * 60;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const active = invoice => invoice && !['draft', 'void', 'cancelled', 'deleted'].includes(String(invoice.status || '').toLowerCase());
export function invoiceFingerprint(invoice, legacy = false) {
  const fields = ['id', 'invoice_number', 'invoice_date', 'job_id', 'customer_name', 'customer_phone', 'customer_address', 'registration', 'vehicle', 'mileage', 'mot_due', 'lines', 'subtotal', 'vat', 'total'];
  if (legacy) fields.push('status');
  return createHash('sha256').update(JSON.stringify(fields.map(key => invoice[key] ?? null))).digest('hex');
}
export function issueInvoiceToken(invoice, secret, now = Date.now(), presentation = {}) {
  const payload = Buffer.from(JSON.stringify({ id: invoice.id, exp: Math.floor(now / 1000) + LINK_SECONDS, hash: invoiceFingerprint(invoice), nonce: randomBytes(16).toString('hex'), presentation: { imageUrl: /^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(presentation.imageUrl || '') ? presentation.imageUrl : '', colour: String(presentation.colour || '').slice(0,40) } })).toString('base64url');
  const signature = createHmac('sha256', secret).update('vecta-invoice-v1.' + payload).digest('base64url');
  return payload + '.' + signature;
}
export function verifyInvoiceToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update('vecta-invoice-v1.' + payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const nowSeconds = Math.floor(now / 1000);
    return validId(value.id) && /^[a-f0-9]{64}$/.test(value.hash) && Number.isInteger(value.exp) && value.exp > nowSeconds && value.exp <= nowSeconds + LINK_SECONDS ? value : null;
  } catch { return null; }
}
async function rows(config, path) {
  const response = await fetch(config.url + '/rest/v1/' + path, { headers: { apikey: config.key, Authorization: 'Bearer ' + config.key }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Invoice register unavailable');
  return response.json();
}
const safeText = value => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7e\xa0-\xff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac]/g, '?');
const money = value => '£' + Number(value || 0).toFixed(2);

export async function renderCustomerInvoicePdf(invoice, settings = {}, job = {}, presentation = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('VECTA Invoice ' + String(invoice.invoice_number || ''));
  pdf.setAuthor('Vecta Motors');
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const red = rgb(0.72, 0.08, 0.12), ink = rgb(0.13, 0.15, 0.18), muted = rgb(0.4, 0.43, 0.47), pale = rgb(0.95, 0.96, 0.97);
  let page, y;
  const pages = [];
  const account = String(invoice.customer_account || (invoice.lines || []).find(line => line.invoice_customer_account)?.invoice_customer_account || job.customer_account || '').toUpperCase();
  const staff = account === 'STAFF', nmuk = account === 'NMUK' || invoice.fleet_customer === 'NMUK';
  const vatRate = Number(settings.vatRate ?? 20) / 100;
  let logo;
  try { logo = await pdf.embedPng(await readFile(new URL('../public/assets/vecta-header.png', import.meta.url))); } catch { /* Text logo remains available. */ }
  const isFleet=!!(invoice.fleet_customer||invoice.fleet_month||invoice.eom_month||invoice.source==='fleet_eom'||invoice.source==='vehicle_tax_eom'||['FLEET ACCOUNT','NMUK TAX'].includes(invoice.registration));
  let car, badge;
  const brand=globalThis.VectaInvoicePrint.manufacturer(invoice.make||invoice.vehicle||job.make);
  if(!isFleet&&brand){try{const svg=await readFile(new URL('../public/assets/manufacturers/'+brand+'.svg',import.meta.url),'utf8');const png=svg.match(/href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);if(png)badge=await pdf.embedPng(Buffer.from(png[1],'base64'));}catch{}}
  // Only the signed, stored supplier asset is fetched; PDF viewing never queues a lookup.
  if(!isFleet&&/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(presentation.imageUrl||'')){
    try{
      const response=await fetch(presentation.imageUrl,{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok||Number(response.headers.get('content-length')||0)>2000000)throw Error('Artwork unavailable');
      const reader=response.body.getReader(),chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('Artwork too large');}chunks.push(value);}
      let bytes=Buffer.concat(chunks);
      if(/\.svgz?$/.test(presentation.imageUrl)){
        if(bytes[0]===31&&bytes[1]===139)bytes=gunzipSync(bytes,{maxOutputLength:2000000});
        let svg=bytes.toString('utf8');
        const colours={BLACK:'#191b20',WHITE:'#f5f5f2',SILVER:'#bfc3c8',GREY:'#626970',GRAY:'#626970',BLUE:'#1c4778',RED:'#ac1727',GREEN:'#204c36',YELLOW:'#e5ba20',ORANGE:'#d56b22',BROWN:'#77513b',BEIGE:'#c1ac88',GOLD:'#b59a50'};
        const colour=colours[String(presentation.colour||'').toUpperCase()];
        if(colour)svg=svg.replace(/(<g\b[^>]*id=["']transpar(?:a|e)nt_colour["'][^>]*>)([\s\S]*?)(<\/g>)/i,(_,open,body,close)=>open+body.replace(/fill=["'](?!none)[^"']*["']/g,'fill="'+colour+'"')+close);
        car=await pdf.embedPng(new Resvg(svg,{fitTo:{mode:'width',value:600}}).render().asPng());
      }else if(/\.png$/.test(presentation.imageUrl))car=await pdf.embedPng(bytes);
      else if(/\.jpe?g$/.test(presentation.imageUrl))car=await pdf.embedJpg(bytes);
    }catch{/* Vehicle details remain printable when stored artwork is unavailable. */}
  }
  function text(value, x, at, size = 10, font = regular, color = ink) { page.drawText(safeText(value), { x, y: at, size, font, color }); }
  function right(value, x, at, size = 10, font = regular) { const clean = safeText(value); text(clean, x - font.widthOfTextAtSize(clean, size), at, size, font); }
  function wrap(value, width, size = 10, font = regular) {
    const result = [];
    for (const paragraph of String(value ?? '').split(/\r?\n/)) {
      let line = '';
      for (const word of safeText(paragraph).split(/\s+/)) {
        if (font.widthOfTextAtSize((line ? line + ' ' : '') + word, size) <= width) { line += (line ? ' ' : '') + word; continue; }
        if (line) { result.push(line); line = ''; }
        let remaining = word;
        while (font.widthOfTextAtSize(remaining, size) > width) {
          let n = 1; while (n < remaining.length && font.widthOfTextAtSize(remaining.slice(0, n + 1), size) <= width) n++;
          result.push(remaining.slice(0, n)); remaining = remaining.slice(n);
        }
        line = remaining;
      }
      result.push(line);
    }
    return result;
  }
  function newPage() {
    page = pdf.addPage([595.28, 841.89]); pages.push(page);
    page.drawRectangle({ x: 42, y: 793, width: 511, height: 3, color: red });
    text('VECTA MOTORS', 42, 813, 11, bold, red);
    right('INVOICE ' + invoice.invoice_number, 553, 813, 10, bold);
    y = 769;
  }
  function ensure(height) { if (y - height < 112) newPage(); }
  function paragraph(value, x, width, font = regular, size = 10) {
    for (const line of wrap(value, width, size, font)) { ensure(15); text(line, x, y, size, font); y -= 15; }
  }
  newPage();
  const headerOffset=isFleet?0:-4;
  if(!isFleet){
    const vehicleLines=wrap(invoice.vehicle||job.vehicle||'Vehicle',170,12,bold).slice(0,2);
    vehicleLines.forEach((line,i)=>text(line,250,750-i*15,12,bold));
    const plate=String(invoice.registration||'NO REG').toUpperCase(),plateWidth=Math.max(100,bold.widthOfTextAtSize(plate,17)+28);
    page.drawRectangle({x:250,y:701,width:plateWidth,height:28,color:rgb(.95,.80,.22),borderColor:ink,borderWidth:.7});
    page.drawRectangle({x:250,y:701,width:17,height:28,color:rgb(.09,.38,.55)});
    text('GB',253,710,7,bold,rgb(1,1,1));text(plate,273,708,17,bold);
    if(badge){const scale=Math.min(32/badge.width,24/badge.height);page.drawImage(badge,{x:250+plateWidth+10,y:703,width:badge.width*scale,height:badge.height*scale});}
    text('Mileage: '+(invoice.mileage??job.mileage??'Not recorded'),250,686,9,regular,muted);
    text('MOT due: '+String(invoice.mot_due||job.mot_due||'Not recorded').slice(0,10),250,672,9,regular,muted);
    if(car){const scale=Math.min(120/car.width,80/car.height);page.drawImage(car,{x:553-car.width*scale,y:700,width:car.width*scale,height:car.height*scale});}

  }
  if (logo) { const scale = Math.min((isFleet?215:180) / logo.width, 48 / logo.height); page.drawImage(logo, { x: 42, y: 710-headerOffset, width: logo.width * scale, height: logo.height * scale }); }
  else text('VECTA', 42, 721-headerOffset, 32, bold, red);
  right('INVOICE', 553, isFleet?745:610, 24, bold); right(invoice.invoice_number || '', 553, isFleet?722:587, 13, bold); right(invoice.invoice_date || '', 553, isFleet?704:569, 10);
  y = 682-headerOffset;
  const business = nmuk ? ['10 Hunter Close', 'East Boldon, Tyne and Wear, NE36 0TB', 'Email: shirken.moore@talktalk.net'] : ['Contractors Compound, Nissan Motor Manufacturing', 'Nissan Way, Washington, SR5 3NS'];
  for (const line of [...business, 'Tel: 07721722622', 'VAT No. 169170002']) { for(const part of wrap(line,isFleet?320:180,9)){text(part,42,y,9,regular,muted);y-=12;} }
  if(!isFleet)y=Math.min(y,550);
  y -= 18; text('CUSTOMER', 42, y, 9, bold, muted); y -= 19;
  paragraph(invoice.customer_name || 'Customer', 42, 511, bold, 12);
  if (invoice.customer_address) paragraph(invoice.customer_address, 42, 511);
  y -= 12;
  const identity = [invoice.registration, invoice.vehicle, invoice.mileage ? 'Mileage: ' + invoice.mileage : '', invoice.mot_due ? 'MOT due: ' + String(invoice.mot_due).slice(0, 10) : ''].filter(Boolean).join('  |  ');
  if(isFleet)paragraph(identity, 42, 511, bold, 10); y -= 14;
  function tableHead() {
    ensure(36); page.drawRectangle({ x: 42, y: y - 8, width: 511, height: 26, color: pale });
    text('WORK CARRIED OUT', 51, y, 9, bold); right(staff ? 'AMOUNT (EX VAT)' : 'AMOUNT', 480, y, 8, bold); right('VAT', 544, y, 8, bold); y -= 34;
  }
  tableHead();
  for (const line of invoice.lines || []) {
    const description = wrap(line.description || 'Workshop work', 330);
    const mode = String(line.vat_mode || 'inc_vat');
    const amount = staff && mode === 'inc_vat' ? Number(line.amount || 0) / (1 + vatRate) : Number(line.amount || 0);
    let first = true;
    for (const part of description) {
      if (y < 133) { newPage(); tableHead(); }
      text(part, 51, y);
      if (first) { right(money(amount), 480, y); right(mode === 'no_vat' ? 'No VAT' : staff ? 'Ex VAT' : mode === 'ex_vat' ? 'Ex VAT' : 'Inc VAT', 544, y, 8); first = false; }
      y -= 15;
    }
    y -= 11; page.drawLine({ start: { x: 42, y: y + 4 }, end: { x: 553, y: y + 4 }, thickness: 0.5, color: pale });
  }
  ensure(220); y = 316;
  for (const [label, value] of [['Subtotal', invoice.subtotal], ['VAT', invoice.vat]]) { text(label, 365, y); right(money(value), 544, y); y -= 24; }
  page.drawRectangle({ x: 350, y: y - 12, width: 203, height: 35, color: ink });
  page.drawText('TOTAL', { x: 365, y, size: 11, font: bold, color: rgb(1, 1, 1) });
  const total = money(invoice.total); page.drawText(total, { x: 544 - bold.widthOfTextAtSize(total, 16), y: y - 1, size: 16, font: bold, color: rgb(1, 1, 1) });
  y -= 48; text('PAYMENT DETAILS', 42, y, 9, bold, muted); y -= 18;
  paragraph(['Bank: ' + (settings.bankName || ''), 'Account name: ' + (settings.accountName || 'Vecta Motors'), 'Account number: ' + (settings.accountNumber || ''), 'Sort code: ' + (settings.sortCode || ''), 'Reference: ' + (invoice.registration || invoice.invoice_number)].join('\n'), 42, 511, regular, 9);
  pages.forEach((p, index) => { page = p; text('VectaMotors.co.uk', 42, 48, 9, regular, muted); right('Page ' + (index + 1) + ' of ' + pages.length, 553, 48, 8); });
  return Buffer.from(await pdf.save());
}

export default async function invoicePdfHandler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    if (req.method === 'POST') {
      const host = String(req.headers.host || '');
      let origin; try { origin = new URL(req.headers.origin).host; } catch { return res.status(403).json({ error: 'Workshop origin required' }); }
      if (origin !== host) return res.status(403).json({ error: 'Workshop origin required' });
      const credentials = { user: process.env.VECTA_MAIN_USER, password: process.env.VECTA_MAIN_PASSWORD };
      const request = new Request('https://' + host + '/index.html', { headers: { cookie: String(req.headers.cookie || ''), authorization: String(req.headers.authorization || '') } });
      if (!await validManagerSession(request, credentials) && managerGate(request, credentials)) return res.status(401).json({ error: 'Manager sign-in required' });
    }
    const config = databaseEnvironment({ requireService: true });
    const secret = process.env.VECTA_INVOICE_LINK_SECRET || createHmac('sha256', config.key).update('VECTA invoice links v1').digest('hex');
    let token = req.query.token;
    if (req.method === 'GET' && req.query.code !== undefined) {
      if (!/^[A-Za-z0-9_-]{24}$/.test(req.query.code)) return res.status(404).json({error:'Invoice link is unavailable or has expired'});
      const hash = createHash('sha256').update(req.query.code).digest('hex');
      const saved = (await rows(config, 'invoice_customer_links?select=signed_token,expires_at&token_hash=eq.' + hash + '&limit=1'))[0];
      if (!saved || Date.parse(saved.expires_at) <= Date.now()) return res.status(404).json({error:'Invoice link is unavailable or has expired'});
      token = saved.signed_token;
    }
    const claim = req.method === 'GET' ? verifyInvoiceToken(token, secret) : null;
    const id = req.method === 'POST' ? req.body?.invoice_id : claim?.id;
    if (!validId(id)) return res.status(404).json({ error: 'Invoice link is unavailable or has expired' });
    const invoice = (await rows(config, 'invoices?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1'))[0];
    if (!active(invoice) || (claim && ![invoiceFingerprint(invoice), invoiceFingerprint(invoice, true), invoiceFingerprint({ ...invoice, status: 'saved' }, true)].includes(claim.hash))) return res.status(404).json({ error: 'Invoice link is unavailable or has expired' });
    if (req.method === 'POST') {
      const token = issueInvoiceToken(invoice, secret, Date.now(), req.body?.presentation || {});
      let url = 'https://' + req.headers.host + '/invoice?token=' + token;
      if (req.body?.compact === true) {
        const code = randomBytes(18).toString('base64url');
        const response = await fetch(config.url + '/rest/v1/invoice_customer_links', {
          method:'POST', headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json',Prefer:'return=minimal'},
          body:JSON.stringify({token_hash:createHash('sha256').update(code).digest('hex'),signed_token:token,expires_at:new Date(Date.now()+LINK_SECONDS*1000).toISOString()}),signal:AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error('Invoice link could not be saved');
        url = 'https://' + req.headers.host + '/i/' + code;
      }
      return res.status(201).json({ url, expires_in_days: 90 });
    }
    const [settingRows, jobRows] = await Promise.all([
      rows(config, 'workshop_settings?select=value&id=eq.main&limit=1'),
      validId(invoice.job_id) ? rows(config, 'jobs?select=*&id=eq.' + encodeURIComponent(invoice.job_id) + '&limit=1') : Promise.resolve([])
    ]);
    if (req.query.download !== '1' && req.query.format !== 'pdf') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https://www.haynespro-assets.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      return res.status(200).send(renderCustomerInvoiceHtml(invoice, settingRows[0]?.value || {}, jobRows[0] || {}, claim.presentation || {}));
    }
    const bytes = await renderCustomerInvoicePdf(invoice, settingRows[0]?.value || {}, jobRows[0] || {}, claim.presentation || {});
    const filename = ('VECTA-Invoice-' + (invoice.invoice_number || '') + '.pdf').replace(/[^a-zA-Z0-9_.-]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', (req.query.download === '1' ? 'attachment' : 'inline') + '; filename="' + filename + '"');
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('Customer invoice PDF unavailable:', error.message);
    return res.status(503).json({ error: 'Invoice download is temporarily unavailable. Please try again.' });
  }
}
