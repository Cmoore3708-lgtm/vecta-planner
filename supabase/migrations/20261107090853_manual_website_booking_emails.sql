-- Booking confirmations are unsent email-app drafts prepared after the owner
-- confirms a website provisional booking. Stop the old automatic sender.
begin;
set local lock_timeout = '5s';

alter table public.website_booking_requests
  disable trigger vecta_queue_booking_receipt;

update public.website_booking_receipts
set status = 'cancelled',
    lease = null,
    lease_until = null,
    error = 'Automatic booking emails disabled by workshop owner. Confirmation is prepared manually when the website provisional booking is accepted.'
where status in ('pending', 'sending', 'failed', 'needs_review');

commit;
