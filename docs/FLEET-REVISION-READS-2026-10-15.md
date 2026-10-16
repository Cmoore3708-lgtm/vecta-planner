# Reduce repeated Fleet save downloads

A read-only production size check found the current `fleet_state_v77` value is
524,950 bytes as PostgreSQL JSON text, containing 324 vehicles, 521 plans and 643
completions. Existing saves download the complete row, merge, send the complete
value and receive a full receipt. This change removes the first full download
when the last confirmed database revision is still current.

The browser stores the confirmed value and outer database `updated_at` together
in one versioned local-storage entry. A save captures that pair with its desired
snapshot. The save helper first selects `id,updated_at`; an exact revision match
allows the confirmed baseline to stand in for the unchanged remote value. The
write still filters on that revision. A competing write causes a retry, a full
remote read and the existing field-by-field merge/conflict checks. There is no
blind-write shortcut and no timestamp-only last-writer-wins merge.

If the revision differs, is missing or cannot be read, the helper either uses the
original full read/merge path or refuses the save. Old offline baselines remain
supported. Invalid/new cache entries fall back to the old confirmed baseline;
quota failure does not split a baseline and its revision into different writes.
The nightly updater supplies the revisions it already read, retaining the same
conflict protection for Fleet and MOT-authority writes.

Seven executable tests cover unchanged revisions, independent edits, races,
same-field conflicts, missing baselines/read errors, atomic cache persistence,
and offline/legacy/corrupt-cache recovery. The original record safety and nightly
MOT checks remain in place. No database migration or financial-data rewrite is
required.

Scope: the complete value is still written and returned, and cross-device changes
still require a full read. This is not individual-record database storage or an
incremental download protocol. It removes roughly one current snapshot's raw
payload from an uncontended save; no live latency improvement is claimed. A
per-record migration still needs a compatible plan for old devices, offline edits,
nightly writes, backup coverage and a rollback path.
