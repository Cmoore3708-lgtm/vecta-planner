import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import handler, { issueInvoiceToken, verifyInvoiceToken, invoiceFingerprint, renderCustomerInvoicePdf } from '../../api/_invoice-pdf.js';
import { managerSessionCookie, requiresManagerLogin } from '../../middleware.js';

const invoice = { id: 'invoice-123', invoice_number: 'VECTA-79001', invoice_date: '2026-10-07', job_id: 'job-123', customer_name: 'Jane Smith', registration: 'AB12 CDE', vehicle: 'Nissan Qashqai', mileage: 48210, status: 'saved', lines: [
  { description: 'Full service - oil and filter replacement', amount: 120, vat_mode: 'inc_vat', invoice_customer_account: 'STAFF' },
  { description: 'MOT test', amount: 54, vat_mode: 'no_vat' }
], subtotal: 154, vat: 20, total: 174 };
const settings = { vatRate: 20, bankName: 'Test Bank', accountName: 'Vecta Motors', accountNumber: '12345678', sortCode: '12-34-56' };
const secret = 'test-only-link-signing-key';

test('signed tokens are invoice-specific, expire, reject tampering and do not expose secrets', () => {
  const now = Date.now(), token = issueInvoiceToken(invoice, secret, now);
  assert.equal(verifyInvoiceToken(token, secret, now).id, invoice.id);
  assert.equal(verifyInvoiceToken(token, secret, now + 91 * 86400000), null);
  assert.equal(verifyInvoiceToken(token, 'wrong-key', now), null);
  assert.equal(verifyInvoiceToken(token.slice(0, -1), secret, now), null);
  assert.equal(verifyInvoiceToken(token + 'extra', secret, now), null);
  assert.equal(verifyInvoiceToken('invoice-123', secret, now), null);
  assert.notEqual(invoiceFingerprint(invoice), invoiceFingerprint({ ...invoice, total: 175 }));
  assert.notEqual(invoiceFingerprint(invoice), invoiceFingerprint({ ...invoice, status: 'void' }));
  const decoded = Buffer.from(token.split('.')[0], 'base64url').toString();
  assert.ok(!decoded.includes(invoice.customer_name)); assert.ok(!token.includes(secret));
  assert.equal(requiresManagerLogin('/invoice'), false, 'Customer download must not ask for workshop credentials');
});

function response() {
  return { code: 0, headers: {}, status(code) { this.code = code; return this; }, setHeader(name, value) { this.headers[name] = value; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}
test('only a signed-in manager can issue links; customer token fetch exposes only the PDF', async () => {
  const oldEnv = { ...process.env }, oldFetch = globalThis.fetch;
  Object.assign(process.env, { VERCEL_ENV: 'production', SUPABASE_URL: 'https://unit-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-service-key', VECTA_MAIN_USER: 'Manager', VECTA_MAIN_PASSWORD: 'manager-secret', VECTA_INVOICE_LINK_SECRET: secret });
  delete process.env.VITE_SUPABASE_URL; delete process.env.VERCEL_PROJECT_NAME; delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  let currentInvoice = invoice, reads = 0;
  globalThis.fetch = async url => {
    reads++; const path = new URL(url).pathname;
    return new Response(JSON.stringify(path.endsWith('/invoices') ? (currentInvoice ? [currentInvoice] : []) : path.endsWith('/workshop_settings') ? [{ value: settings }] : [{ customer_account: 'Staff' }]), { status: 200 });
  };
  try {
    const headers = { host: 'workshop.example', origin: 'https://workshop.example' };
    let res = response(); await handler({ method: 'POST', headers, body: { invoice_id: invoice.id }, query: {} }, res);
    assert.equal(res.code, 401); assert.equal(reads, 0, 'Unauthenticated mint must not read any invoice');
    const cookie = await managerSessionCookie({ user: 'Manager', password: 'manager-secret' });
    const authorised = { ...headers, cookie: cookie.split(';')[0] };
    res = response(); await handler({ method: 'POST', headers: { ...authorised, origin: 'https://attacker.example' }, body: { invoice_id: invoice.id }, query: {} }, res);
    assert.equal(res.code, 403); assert.equal(reads, 0);
    res = response(); await handler({ method: 'POST', headers: authorised, body: { invoice_id: invoice.id }, query: {} }, res);
    assert.equal(res.code, 201); const link = new URL(res.body.url), token = link.searchParams.get('token');
    assert.equal(link.origin, 'https://workshop.example'); assert.equal(link.pathname, '/invoice');
    assert.equal(Object.keys(res.body).length, 2, 'Do not return customer records or server secrets');
    res = response(); await handler({ method: 'GET', headers: {}, query: { token } }, res);
    assert.equal(res.code, 200); assert.equal(res.headers['Content-Type'], 'application/pdf'); assert.match(res.body.toString('ascii', 0, 5), /^%PDF-/);
    assert.match(res.headers['Cache-Control'], /no-store/); assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
    assert.match(res.headers['Content-Disposition'], /^inline; filename="VECTA-Invoice-VECTA-79001.pdf"/);
    const pdf = await PDFDocument.load(res.body); assert.equal(pdf.getPageCount(), 1);
    currentInvoice = { ...invoice, total: 175 }; res = response(); await handler({ method: 'GET', headers: {}, query: { token } }, res); assert.equal(res.code, 404);
    currentInvoice = { ...invoice, status: 'void' }; res = response(); await handler({ method: 'GET', headers: {}, query: { token } }, res); assert.equal(res.code, 404);
    currentInvoice = null; res = response(); await handler({ method: 'GET', headers: {}, query: { token } }, res); assert.equal(res.code, 404);
    const count = reads; res = response(); await handler({ method: 'GET', headers: {}, query: { token: 'invalid' } }, res); assert.equal(res.code, 404); assert.equal(reads, count);
    currentInvoice = invoice; res = response(); await handler({ method: 'GET', headers: {}, query: { token, download: '1' } }, res); assert.match(res.headers['Content-Disposition'], /^attachment/);
    res = response(); await handler({ method: 'DELETE', headers: {}, query: {} }, res); assert.equal(res.code, 405);
    process.env.VERCEL_ENV = 'preview'; delete process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY;
    res = response(); await handler({ method: 'GET', headers: {}, query: { token } }, res); assert.equal(res.code, 503, 'Preview must never fall back to live invoices');
  } finally { globalThis.fetch = oldFetch; for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]; Object.assign(process.env, oldEnv); }
});

test('PDF renderer handles long descriptions and many work lines without clipping page boundaries', async () => {
  const bytes = await renderCustomerInvoicePdf({ ...invoice, lines: Array.from({ length: 75 }, (_, i) => ({ description: 'Work line ' + i + ' ' + 'Long description '.repeat(12), amount: 12, vat_mode: 'inc_vat' })) }, settings);
  const pdf = await PDFDocument.load(bytes); assert.ok(pdf.getPageCount() > 2);
  const unicode = await renderCustomerInvoicePdf({ ...invoice, customer_name: 'Renée 李', lines: [{ description: 'Réparation ✓ - filter replacement', amount: 174, vat_mode: 'inc_vat' }] }, settings);
  assert.equal((await PDFDocument.load(unicode)).getPageCount(), 1);
});
