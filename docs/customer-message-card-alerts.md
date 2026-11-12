# Customer message alerts on dashboard cards

Requested by Chris on 11 November 2026: show an alert against each dashboard job card when its customer has sent a message.

Red envelope badges show the number of unread incoming portal events on allocated, mobile, unallocated, provisional and quote cards. Mechanics see only the forwarded updates already permitted by their existing queue. Tapping the badge opens that saved job and scrolls to its conversation. A busy editor is preserved.

Read receipts are shared across devices within each authenticated role. Opening a message (including tapping its dashboard badge or the popup’s Open job card button) marks that message read after server confirmation. The explicit **Mark messages as read** button still acknowledges only the displayed incoming messages. Later messages remain unread. Dismissal hides only the local popup. Manager receipts do not clear forwarded mechanic alerts.

Queue polling refreshes receipts every ten seconds while visible and on focus, foregrounding or reconnection. Cached receipts survive an offline reload. Existing device-local read IDs are uploaded on the next successful refresh; dismissed popups are not migrated as reads. Only IDs and role flags are cached, not message text/contact details. A failed receipt save leaves the badge active; an unavailable local cache does not undo a confirmed server receipt. Delivered notifications are closed when the device next receives the shared receipt; a sleeping/closed phone cannot be promised an immediate notification-tray update.

Website booking read status is separate from acceptance. Opening its job card writes only `reviewed_at`; the unread navigation/app badge count excludes it on every device. Its request stays in **Awaiting acceptance**, labelled **Opened — awaiting acceptance**, until explicitly confirmed, contacted or archived. Realtime, foreground and existing safety polling refresh that count without overwriting an open editor. Booking pushes use the same unread definition.

Deploy `20261112152341_shared_alert_read_state.sql` before this app release. It only adds nullable `manager_read_at`, `mechanic_read_at` and `reviewed_at` fields, retaining existing rows, RLS and grants. Private same-origin workshop endpoints validate IDs and derive the role from login; customers cannot write receipts and customer portal responses do not expose them. Test migration is applied; Main migration is pending release approval.

The requested display addition is implemented in the portal module with a scoped badge overlay and text clearance. Existing protected card renderers, shared dashboard rules and the dashboard layout baseline are unchanged. The source and generated Main/mechanics layout checks pass.

## Verification

Cross-device tests cover independent browser storage, automatic opening, later messages, role isolation, offline/resume, old local receipts, failed writes and blocked local storage. Backend tests cover idempotency, role/authentication boundaries, unchanged booking status and additive schema upgrade. Full release-gate results and preview status are recorded in the pull request.
