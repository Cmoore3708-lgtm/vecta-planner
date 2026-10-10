import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { databaseEnvironment } from './_database-environment.js';
import { managerGate, validManagerSession } from '../middleware.js';

const LINK_SECONDS = 90 * 24 * 60 * 60;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const active = invoice => invoice && !['draft', 'void', 'cancelled', 'deleted'].includes(String(invoice.status || '').toLowerCase());
export function invoiceFingerprint(invoice) {
  const fields = ['id', 'invoice_number', 'invoice_date', 'job_id', 'customer_name', 'customer_phone', 'customer_address', 'registration', 'vehicle', 'mileage', 'mot_due', 'lines', 'subtotal', 'vat', 'total', 'status'];
  return createHash('sha256').update(JSON.stringify(fields.map(key => invoice[key] ?? null))).digest('hex');
}
export function issueInvoiceToken(invoice, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id: invoice.id, exp: Math.floor(now / 1000) + LINK_SECONDS, hash: invoiceFingerprint(invoice), nonce: randomBytes(16).toString('hex') })).toString('base64url');
  const signature = createHmac('sha256', secret).update('vecta-invoice-v1.' + payload).digest('base64url');
  return payload + '.' + signature;
}
export function verifyInvoiceToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
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

export async function renderCustomerInvoicePdf(invoice, settings = {}, job = {}) {
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
  if (logo) { const scale = Math.min(215 / logo.width, 48 / logo.height); page.drawImage(logo, { x: 42, y: 710, width: logo.width * scale, height: logo.height * scale }); }
  else text('VECTA', 42, 721, 32, bold, red);
  right('INVOICE', 553, 745, 24, bold); right(invoice.invoice_number || '', 553, 722, 13, bold); right(invoice.invoice_date || '', 553, 704, 10);
  y = 682;
  const business = nmuk ? ['10 Hunter Close', 'East Boldon, Tyne and Wear, NE36 0TB', 'Email: shirken.moore@talktalk.net'] : ['Contractors Compound, Nissan Motor Manufacturing', 'Nissan Way, Washington, SR5 3NS'];
  for (const line of [...business, 'Tel: 07721722622', 'VAT No. 169170002']) { text(line, 42, y, 9, regular, muted); y -= 14; }
  y -= 18; text('CUSTOMER', 42, y, 9, bold, muted); y -= 19;
  paragraph(invoice.customer_name || 'Customer', 42, 511, bold, 12);
  if (invoice.customer_address) paragraph(invoice.customer_address, 42, 511);
  y -= 12;
  const identity = [invoice.registration, invoice.vehicle, invoice.mileage ? 'Mileage: ' + invoice.mileage : '', invoice.mot_due ? 'MOT due: ' + String(invoice.mot_due).slice(0, 10) : ''].filter(Boolean).join('  |  ');
  paragraph(identity, 42, 511, bold, 10); y -= 14;
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
  ensure(220); y -= 12;
  for (const [label, value] of [['Subtotal', invoice.subtotal], ['VAT', invoice.vat]]) { text(label, 365, y); right(money(value), 544, y); y -= 24; }
  page.drawRectangle({ x: 350, y: y - 12, width: 203, height: 35, color: ink });
  page.drawText('TOTAL', { x: 365, y, size: 11, font: bold, color: rgb(1, 1, 1) });
  const total = money(invoice.total); page.drawText(total, { x: 544 - bold.widthOfTextAtSize(total, 16), y: y - 1, size: 16, font: bold, color: rgb(1, 1, 1) });
  y -= 48; text('PAYMENT DETAILS', 42, y, 9, bold, muted); y -= 18;
  paragraph(['Bank: ' + (settings.bankName || ''), 'Account name: ' + (settings.accountName || 'Vecta Motors'), 'Account number: ' + (settings.accountNumber || ''), 'Sort code: ' + (settings.sortCode || ''), 'Reference: ' + (invoice.registration || invoice.invoice_number)].join('\n'), 42, 511, regular, 9);
  pages.forEach((p, index) => { page = p; text('VectaMotors.co.uk', 42, 48, 9, regular, muted); right('Page ' + (index + 1) + ' of ' + pages.length, 553, 48, 8); });
  return Buffer.from(await pdf.save());
}

export async function shortenInvoiceUrl(url) {
  try {
    const response = await fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(6000), redirect: 'error' });
    if (!response.ok) return url;
    const value = (await response.text()).trim();
    const short = new URL(value);
    if (short.protocol !== 'https:' || short.host !== 'tinyurl.com' || short.username || short.password || !/^\/[a-zA-Z0-9_-]+$/.test(short.pathname) || short.search || short.hash) return url;
    return short.href;
  } catch { return url; }
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
    const claim = req.method === 'GET' ? verifyInvoiceToken(req.query.token, secret) : null;
    const id = req.method === 'POST' ? req.body?.invoice_id : claim?.id;
    if (!validId(id)) return res.status(404).json({ error: 'Invoice link is unavailable or has expired' });
    const invoice = (await rows(config, 'invoices?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1'))[0];
    if (!active(invoice) || (claim && claim.hash !== invoiceFingerprint(invoice))) return res.status(404).json({ error: 'Invoice link is unavailable or has expired' });
    if (req.method === 'POST') {
      const token = issueInvoiceToken(invoice, secret);
      const url = 'https://' + req.headers.host + '/invoice?token=' + token;
      const shortUrl = req.body?.shorten === true ? await shortenInvoiceUrl(url) : null;
      return res.status(201).json({ url, expires_in_days: 90, ...(shortUrl ? { short_url: shortUrl } : {}) });
    }
    const [settingRows, jobRows] = await Promise.all([
      rows(config, 'workshop_settings?select=value&id=eq.main&limit=1'),
      validId(invoice.job_id) ? rows(config, 'jobs?select=*&id=eq.' + encodeURIComponent(invoice.job_id) + '&limit=1') : Promise.resolve([])
    ]);
    const bytes = await renderCustomerInvoicePdf(invoice, settingRows[0]?.value || {}, jobRows[0] || {});
    const filename = ('VECTA-Invoice-' + (invoice.invoice_number || '') + '.pdf').replace(/[^a-zA-Z0-9_.-]/g, '-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', (req.query.download === '1' ? 'attachment' : 'inline') + '; filename="' + filename + '"');
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('Customer invoice PDF unavailable:', error.message);
    return res.status(503).json({ error: 'Invoice download is temporarily unavailable. Please try again.' });
  }
}
