# Customer quote replies

The job conversation now offers Send message and Send quote. A quote requires a description (up to 1,200 characters) and an estimated total including VAT. Quote publishing uses the existing private approval links and email/WhatsApp delivery receipts; WhatsApp remains a manual handoff unless its sender is connected and consent is recorded. Plain messages retain camera and photo uploads; switching to a quote retains but does not send any drafted message photos.

Customers see the current job total and revised total if they accept, including VAT and preserving MOT exemptions. Accept (green tick) and Refuse (red X) sit above an always-visible Optional message box, with no explanatory text underneath. A separate Send message only button remains available. They can send a message alone without deciding, or include it with either decision. A decision and its optional message commit atomically alongside the existing approved-work/charge update. Retries do not repeat charges, replace the recorded response, or duplicate messages. The stored description and price remain authoritative.

The office receives the decision with the description, estimate and optional reply. Send to mechanic forwards either decision and reply explicitly. Both the portal and legacy mechanic approval feeds respect forwarding; financial data stays hidden from mechanics. Existing history and old client decision calls remain supported.

## Release

Apply `supabase/migrations/20261112163854_customer_quote_replies.sql` to the destination database before releasing the application. The migration is applied to isolated Test; production remains pending approval. Existing auto-forwarded history is preserved; new decisions require office forwarding.

Run `npm run release:gate`. New regression tests cover both decisions, optional replies, message-only replies, failed transactions, stale contacts/jobs, duplicate requests, mechanic visibility, non-financial summaries and browser UI actions. Local desktop/390px/768px checks use synthetic data and actual shipped UI scripts. Real-device push/email delivery remains a separate verification step.
