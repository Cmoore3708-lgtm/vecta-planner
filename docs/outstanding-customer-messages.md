# Outstanding customer messages — 17 November 2026

Chris requested that customer notifications stay until opened, and that reading a message must not make it disappear before he acknowledges or replies. He also requested a dashboard section for outstanding messages.

- Opening the job or message only records a device-local opened receipt. The pop-up has no Dismiss button or timeout and retains its active message while new arrivals join the queue.
- Pop-ups pause while a job, invoice or other modal/dialog is open. They return immediately when all editors close, even offline, without acknowledging the message or replacing any unsaved work. Polling and new arrivals cannot make them cover an open editor.
- A separate, role-scoped server acknowledgement keeps the job badge and dashboard conversation outstanding across dates, reloads, devices and offline cached alert IDs. Historical read receipts and old clients cannot acknowledge messages. Previously read messages may reappear for explicit review.
- Main shows an Outstanding messages section with a count, customer, registration, latest text and an open-job action. The latest outstanding message expands in the job conversation. History remains in the job and Message Centre after acknowledgement.
- Acknowledgement buttons save only the explicitly selected UUIDs. A reply carries the IDs expanded when that send began and persists them with its idempotent message. Only those customer events on that same job/contact, created before the saved reply, are acknowledged. New arrivals, other jobs and failed replies remain outstanding. An acknowledgement failure after a saved reply leaves the alert outstanding and reports that the reply was saved.
- A reply counts when it is saved in the customer's portal. Email/WhatsApp delivery status remains separately visible; opening WhatsApp externally cannot prove a reply was sent and does not acknowledge anything.

## Upgrade and rollback

Apply the additive `20261117163928_outstanding_customer_messages.sql` migration to isolated Test and Main before activating the new application. It adds two nullable timestamps, preserves event bodies and old read receipts, and changes no RLS/grants. No customer messages or financial records are altered by the migration. No automatic historical acknowledgement is inferred.

The existing dashboard renderers/styles and their locked baseline are unchanged. The requested additional section uses scoped CSS and a separate mount. Update both mechanics aliases to the same verified production release; mechanics retain only forwarded messages and no customer/finance dashboard section.

Rollback by restoring the preceding approved deployment; leave the nullable acknowledgement columns in place. Old clients continue to work, but have their former read-to-clear behaviour until upgraded again.

## Verification

Regression coverage includes failed opens, persistent pop-ups, explicit acknowledgement across independent devices, cached offline alerts, old-client read compatibility, latest-message expansion, reply failures/retries, concurrent arrivals, cross-job isolation, endpoint authentication, and upgrade privacy. Run the repository release gate and production layout lock before merging. Browser checks use synthetic data with all API calls mocked; do not acknowledge real customer messages or send live test replies.
