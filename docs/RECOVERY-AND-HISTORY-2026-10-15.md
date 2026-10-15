# Recovery and historical archive follow-up — 15 October 2026

## Confirmed work

- The existing backup endpoint exports one consistent snapshot and checks every
  table count and the data SHA-256. It does not silently skip missing tables.
- `scripts/sql/protected-historical-archive.sql` was exercised in Test and applied
  to production using the migration name `protected_historical_archive`.
- All eight original datasets were copied unchanged into the private
  `vecta_history.source_datasets` archive in production. Source fingerprints match
  `tests/fixtures/historical-source-fingerprints.json`. Each insert verifies the
  entire stored payload; a conflicting existing copy fails the transaction.
- Anonymous and workshop-browser roles have neither schema usage nor table read
  access. The service has SELECT and INSERT only. RLS is enabled; lack of user
  policies is intentional. Nothing exposes the archive through a browser RPC.
- Consistent exports now include `vecta_history` tables as well as public workshop
  tables and the financial revision audit. Full row-for-row restoration into
  temporary tables passed in Test and production, with all changes rolled back.
  This proves data restoration against the existing schema, not a fresh project.
- Read-only reconciliation found 760 source jobs, zero cloud primary-key matches,
  17 saved finance corrections, one linked to historical source. Source and
  corrected quoted-amount sums were both £103,365. This is not the live financial
  dashboard total: VAT, monthly extras, status/date classification and invoice
  selection still require application-level reconciliation before retirement.
- Production has zero Supabase Storage buckets/objects at this checkpoint.
  This does not prove that vehicle artwork in other projects or services is
  backed up. Auth and hosting/relay configuration still need separate recovery.

## Historical retirement boundary

No historical jobs were imported into the live jobs table. No active job, invoice,
financial correction, service cycle or report source was changed. Embedded data
and Git history remain. Nineteen Full Service descriptions still need safe
service-history reconciliation before correcting old completion IDs/types.
The archive is an additional protected copy, not a replacement application source.

`prepare-historical-archive.mjs` checks all eight source fingerprints, writes a
private SQL file with mode 0600 and refuses to overwrite an existing file. Do not
commit its output or extracted records. Re-running its inserts is idempotent;
a changed payload under an existing source hash is rejected.

```sh
node scripts/prepare-historical-archive.mjs index.html tests/fixtures/historical-source-fingerprints.json EXACT_SOURCE_COMMIT PRIVATE_OUTPUT_SQL
```

Run `scripts/sql/reconcile-historical-archive.sql` for the aggregate comparison.
It never declares source retirement safe.

## Encrypted recovery copies

The portable tools use Node.js built-in crypto, compression and file APIs; no
supplier calls, npm install or database connection is required. Use the supported
Node.js 24 runtime. `lib/encrypted-backup.js` validates the data backup, compresses
it, derives a key using scrypt, and encrypts with AES-256-GCM and a random salt and
nonce. The header is authenticated. Wrong passwords, altered bytes, damaged JSON
and mismatched backup checksums are rejected. Maximum input/recovery size is
64 MiB. A passphrase of at least 16 characters is required for new copies.

Writing a recovery copy uses a verified temporary file and an exclusive hard link
in the same folder to publish it. Existing files and symlinks are not overwritten.
A filesystem that does not support this operation fails safely; choose a private
NTFS folder or supported sync folder. Verify that syncing really reaches another
device/location. Encryption alone does not make a folder off-device.

The tool proves it can decrypt and validate the copy before reporting success.
`open` writes a new local JSON recovery file; it never imports to a database.
Do not place plaintext recovery JSON in a public or shared folder.

```sh
node scripts/encrypted-workshop-backup.mjs seal BACKUP.json --output NEW_COPY.vecta-encrypted --passphrase-stdin
node scripts/encrypted-workshop-backup.mjs verify COPY.vecta-encrypted --passphrase-stdin
node scripts/encrypted-workshop-backup.mjs open COPY.vecta-encrypted --output NEW_RECOVERED.json --passphrase-stdin
node scripts/validate-workshop-backup.mjs NEW_RECOVERED.json
```

Supply the passphrase through stdin or a private `--passphrase-file`; never put
it directly in a command argument, Git, email or an application log. The command
reads one final newline as input termination. The original JSON is retained.

## Windows PC installation — still requires the actual PC

1. Keep the whole recovery-tools folder together, including `backup`, `scripts`
   and `lib`. Node.js 24 must be installed if encrypted copies are enabled.
2. Run `backup/Install-Daily-Backup.ps1` as the Windows user who will run the task.
   Existing configuration/task is replaced only by explicitly running setup.
3. Enter the Workshop Pro HTTPS origin and the backup secret locally. Do not send
   the secret in chat. Choose a private local backup folder.
4. Optionally choose a different encrypted-copy folder which genuinely syncs off
   the PC. Enter and confirm a recovery passphrase. Keep an independent copy of
   that passphrase away from the PC; Windows-protected configuration alone cannot
   recover it after PC/profile loss.
5. Setup runs the first backup. Check the task result, `backup-log.txt`, the new
   local JSON and the new encrypted file. Independently run `verify` on a copied
   encrypted file, then `open` into a new private path and validate that JSON.
6. Confirm the task works after a reboot, with the usual logged-in/out state,
   and after a missed scheduled run. The runner uses Windows user protection for
   credentials. It cannot run under a different profile without reconfiguration.

The task is daily at 18:30 and starts when Windows next becomes available.
Existing installations without encryption configuration keep their current
local-only behaviour. Retention keeps 30 local copies and, when enabled, 30
recovery copies. If download/checksum/encryption verification fails, retention is
not run. A failed encrypted copy leaves the verified local backup available.
Native PowerShell execution, task installation, folder syncing and reboot tests
have not been performed from this environment. No PC task has been changed here.

## Complete disaster recovery still outstanding

The JSON backup excludes schema/functions/policies, Auth identities/sessions,
hosting secrets/configuration, external file stores and other database projects.
Keep reviewed database schema/role dumps and provider configuration exports in
an encrypted location. Rebuild a fresh isolated project, restore data and files,
recreate integrations and then test authorised/denied access and actual user flows
before treating disaster recovery as complete. Do not restore over production as
an exercise. This work did not create a paid project or change a provider plan.

## Shared booking source

`website/booking/index.html` is authoritative. Run `npm run sync:booking` after
editing it to generate `public/booking.html`. Build and regression checks fail if
copies drift. Both entry points now use the existing website implementation,
including transfer feedback, repeat-safe submission, registration/badge layout
and advisory controls. The API and booking admission rules are unchanged.
