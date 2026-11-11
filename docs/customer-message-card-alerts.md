# Customer message alerts on dashboard cards

Requested by Chris on 11 November 2026: show an alert against each dashboard job card when its customer has sent a message.

Red envelope badges show the number of unread incoming portal events on allocated, mobile, unallocated, provisional and quote cards. Mechanics see only the forwarded updates already permitted by their existing queue. Tapping the badge opens that saved job and scrolls to its conversation. A busy editor is preserved.

Dismissal only hides the existing pop-up. The card badge remains until **Mark messages as read** is clicked in the conversation. Only the displayed incoming messages are marked; later messages remain unread. Read status is stored separately for each device and manager/mechanic role, with same-device tabs kept in sync. Cached badges survive an offline reload; only event IDs, job IDs and role flags are cached, not message text or contact details. Failed reads or storage writes do not clear the badge.

Queue pagination prevents older unread messages disappearing behind the previous 250-event limit. Each page retains the existing job/customer binding checks and mechanic redaction. No schema migration or customer notification send is added.

The requested display addition is implemented in the portal module with a scoped badge overlay and text clearance. Existing protected card renderers, shared dashboard rules and the dashboard layout baseline are unchanged. The source and generated Main/mechanics layout checks pass.

## Verification

- 38 focused portal, alert, read-state, notification and pagination tests pass.
- Full regression suite: 1,832 passed, four existing browser-only skips in this environment.
- Phone/cloud synchronization and financial integrity suites pass.
- Production build, payload budgets and source/generated dashboard layout locks pass.
- Browser inspection of sample cards using the actual Main/mechanics card renderers and styles at desktop and 390px phone widths. Checked allocated/compact/unallocated badge positioning and opening/marking-read interaction. These used synthetic data and sent no real customer messages.

Live authenticated preview, physical iPhone/iPad behaviour and the broader release navigation checklist remain to be verified before Main approval. After approval, both mechanics aliases must move to the exact Main release as required by DASHBOARD-LAYOUT-LOCK.md.
