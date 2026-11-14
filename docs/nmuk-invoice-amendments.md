# NMUK monthly invoice amendments

Saved fleet jobs remain frozen. A later job-card edit is not permission to
rewrite an issued invoice or charge the same work again.

The private `vecta_audit.restore_nmuk_invoice_monthly_charges` routine repairs
an unpaid, provably jobs-only NMUK invoice whose individual monthly charge
entries are already saved in `workshop_settings.main.nmukPreviewDrafts`.
It is restricted to the database administrator, uses caller privileges and
does not expose a new public RPC, web endpoint or browser unlock setting.

The caller must supply the reviewed invoice ID, exact invoice revision,
complete saved monthly entries, expected subtotal, reason and unique request
identity. The routine locks the invoice, verifies the saved charges and
all existing totals, records immutable before/after evidence, then updates
the invoice, snapshot summary and protected recovery copy atomically.
Job rows, billing month, invoice number and billed job links are preserved.
Paid invoices, unknown adjustments, changed inputs and conflicting retries
are rejected. Identical retries are idempotent.

An authorisation in the private amendment ledger permits exactly the
recorded before/after transition in that transaction. The existing snapshot,
duplicate billing and billed-identity protections remain active for all
other writes. The ordinary financial-revision trigger additionally captures
the change. No triggers are disabled and no history is deleted.

For a repair, review the current saved monthly entries and calculate the
expected subtotal from the **frozen** job amounts, never current job cards.
Do not use this routine for job repricing or changes to an invoice that
already contains monthly charges. Those require a separately reviewed
amendment or credit process.

## Database validation

Run the migration and `tests/database/nmuk-invoice-amendment.sql`, plus the
existing `tests/database/fleet-billing-integrity.sql`, inside one transaction
and roll it back. The fixtures verify amount reconciliation, protected-copy
consistency, preservation of later-edited jobs, stale/paid/unsaved rejection,
idempotency, immutable amendment history, restricted access, stale snapshot
rejection and unaffected ordinary address saves. The existing suite checks
duplicate billing and billed job identity guards.

The November 2026 October-invoice reconciliation uses the original £7,175
job breakdown and £2,090 saved monthly entries: £9,265 ex VAT, £1,853 VAT,
£11,118 total. A later £45 edit to NMDR2 is not part of that frozen breakdown
and must not be silently added to this reconciliation.
