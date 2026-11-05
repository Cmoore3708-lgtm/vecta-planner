import { createHmac, timingSafeEqual } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(value));
const sign = (payload, secret) => createHmac('sha256', secret).update('website-booking-analytics-v1:' + payload).digest('base64url');
// Issued only after a real booking has been saved. No customer details in the token.
export function bookingAnalyticsReceipt(booking, secret, now = Date.now()) {
  if (!secret || !uuid.test(booking?.id) || !Number.isFinite(Date.parse(booking.created_at))) return undefined;
  const created = Date.parse(booking.created_at);
  if (created > now || now - created > 15 * 60 * 1000) return undefined;
  const payload = Buffer.from(JSON.stringify({ id: booking.id, day: day(created), expires: created + 15 * 60 * 1000 })).toString('base64url');
  return payload + '.' + sign(payload, secret);
}
export function readBookingAnalyticsReceipt(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 500 || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = Buffer.from(sign(parts[0], secret)), actual = Buffer.from(parts[1]);
  if (!timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!uuid.test(data.id) || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) || !Number.isSafeInteger(data.expires) || data.expires < now || data.expires > now + 15 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}
