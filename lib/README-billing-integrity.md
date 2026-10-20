Billing integrity changes are scoped to job identity, overlapping-work review and
immutable month-end supporting evidence. No existing job, invoice amount or
completion date is rewritten by the migration. Legacy month-end invoices without
a frozen snapshot must be reconciled against their original issued spreadsheet.

Existing job writes use UPDATE with a returned-row check. Only explicit creation
entry points may INSERT/UPSERT. Offline queue entries preserve that intent.
An old queue without creation intent cannot recreate a missing server record.

Overlaps are review candidates, not proof of duplicate charges. The review compares
priced items, registration and work dates within 31 days. A reason acknowledging
separate work is tied to both cards' contents; editing either card invalidates it.

The database serializes invoice job-link changes and rejects links already owned
by another invoice. Saved snapshots and linked job IDs cannot be changed after
capture. Corrections to issued work require the existing invoice to be reviewed,
not silently rebuilding a second month-end invoice.
