# VECTA Workers — permanent workshop installation

The desktop entry point is always **Start VECTA Workers**. It opens one small
connection manager and starts Haynes, tyres and the shared GSF service/repair
worker. Downloaded folders are used only for the initial migration, never for
daily operation or subsequent updates.

Status: implementation prepared for review. Local automated release tests and
packaged dependency/import checks have been exercised. Native Windows CI and
actual workshop-PC supplier acceptance must pass before the first live rollout.
No new manager or updater has been installed on the workshop PC by this work.

## One-time migration

Use the complete **VECTA-Workers-Setup.zip**, extract it, and run **START-HERE.cmd**
on the same Windows account used for the current workers. Close existing worker
consoles first. Node.js 22+ and Microsoft Edge must already be present.

If the previous shortcut-only setup recorded the working GSF folder, migration
uses it. Otherwise a single file picker requests the existing
`repair-connection.local.json` in the working GSF/repair installation. It is a
local selection; do not send or upload that file. Preview pairing is rejected.

Migration copies the existing repair configuration, pairing and optional service
configuration into protected persistent storage. It preserves the existing
Windows-encrypted Haynes pairing and all four supplier browser profiles. It
prepares and checks the new code before switching the installed version. Old
Downloads copies are not modified. An existing exact `Vecta Haynes Test.lnk`
Startup shortcut is backed up and retired after installation succeeds so an old
copy cannot start first on the next sign-in. No other startup task is changed.
Automatic Windows sign-in startup is not enabled by this installer.

After setup, use the desktop button. The original download/extracted setup is
no longer required. Keep old worker folders until the workshop acceptance tests
pass; they remain an independent migration rollback.

## Daily use

Double-click **Start VECTA Workers**. The manager checks the approved release
channel when all workers are stopped, then starts the installed workers. If an
update check fails or the channel has not been published, it starts the existing
installed version. It does not reinstall packages on an ordinary start.

A valid tyre session with verified pricing settings proceeds without an Enter
prompt. Expired sessions or uncertain settings still need supplier sign-in or
confirmation in the worker window. No passwords are embedded or automatically
submitted. Supplier challenges cannot be bypassed by a desktop launcher.

Keep the PC awake, signed in and online. Keep worker and supplier windows open.
Closing the connection-manager window leaves workers running; reopening the
same desktop button detects them and does not create duplicates.

The manager shows starting, relay reachable, checking requests, reconnecting,
needs attention and stopped. **Relay reachable** does not claim that every
supplier session or vehicle lookup has been verified. Status comes from the
running worker, carries a timestamp and process ID, and expires after 60 seconds.
Login/settings failures remain visible across successful idle relay polls until
a subsequent lookup succeeds. No customer or supplier data enters status files.

**Stop safely** asks managed workers to finish current lookups and stop before
accepting more work. It does not force-kill browsers. A worker waiting for manual
input may require its console to be closed. Independently started old workers
must be stopped in their own windows. **Check updates** defers while any worker
runner is detected. **Restore previous** switches back when workers are stopped,
then starts that version. A rejected version is blocked from automatic reapply.

## Permanent layout and compatibility

Under `%LOCALAPPDATA%\VectaWorkers`:

- `Start-VECTA.ps1`: stable bootstrap targeted by the Desktop shortcut.
- `state.json`: atomic active/previous version pointer and rejected-version list.
- `releases/<40-character-commit>/`: immutable worker code and pinned dependencies.
- `data/repair-quotes/` and `data/gsf/`: persistent private configuration, outside releases.
- `runtime/`: process/status records and cooperative stop requests.
- `migration-backup/`: the exact retired Haynes startup shortcut, if present.

Existing `VectaHaynes`, `VectaTyres`, `VectaGSF` and `VectaRepairQuotes` profile
locations are retained. The GSF entrypoint supports the persistent data directory
only when the manager supplies it; old standalone launches keep their existing
configuration paths. Current-account/SYSTEM ACLs protect the new installation.
Reinstalling preserves newer installed configuration rather than copying stale
settings over it. No database credentials or schema changes are required.

## Update and release ownership

Website releases and worker releases are separate. A website amendment does not
change the approved worker channel. Normal Main pushes do not publish workers.

The workflow **Publish approved workshop workers** requires an exact Main commit,
a recorded workshop-PC acceptance result, passing Linux release checks, passing
native Windows tests, and approval in the `worker-production` GitHub environment.
The publisher fails closed if that environment has no required reviewers.
Configure required reviewers before the first release; this amendment does not
silently publish or bypass that requirement. Workflow dispatch itself must run
from Main. The first approved worker release/channel has not been published yet.

The workflow creates an immutable `workers-<commit>` GitHub release containing
`workers.vecta.gz` and the one-time setup ZIP. The small `workers-stable/channel.json`
asset is moved only after the immutable release is available. TLS and the fixed
repository/channel identify the release authority; SHA-256 detects damaged or
substituted package content. Checksums are not an independent signing key.

The updater accepts only the fixed repository's versioned release URL, validates
archive size/path/content hashes and runtime dependencies, stages pinned npm
packages with lifecycle scripts and bundled-browser downloads disabled, checks
module imports, and atomically changes the active pointer only after preparation
succeeds. Updates take a maintenance lock; worker starts are blocked during that
operation. It rechecks managed process records before activation. No in-place
source file patching or moving-tip-of-Main updates occur.

Both releases and private data are retained. Cleanup is deliberately not automatic
in the first release. No updater may delete profiles, credentials or offline
workshop data. A future release must preserve bootstrap/state/data format-1
compatibility or provide a separately reviewed migration.

## Validation and first rollout

`node --test tests/regression/managed-worker-releases.test.mjs` exercises complete
packaging, bad paths/checksums, failed preparation, in-flight update deferral,
rollback/reapply prevention, offline fallback, persistent settings after the old
folder disappears, maintenance locking, status semantics and tyre confirmation.

`powershell -File scripts/test-worker-windows.ps1` uses synthetic pairing/stub
workers to test native DPAPI, paths with spaces, environment separation, duplicate
prevention, cooperative stop and shortcut stability. On an ephemeral GitHub
runner it also exercises the complete installer and pinned npm layout without
opening any supplier or relay endpoint. PowerShell AST parsing is also checked.
These tests do not prove live supplier readiness or visually approve the GUI.

Before the first workshop rollout verify: actual PC account/pairing and selected
configuration; all three real relay environments; one read-only supplier lookup
each; existing service/repair pricing policies; duplicate desktop clicks and old
startup entries; login expiry; network loss; sleep/resume; safe stop during a
lookup; an approved update plus restore using the same desktop shortcut; and
preserved supplier sessions/settings. Never announce completion on the strength
of a downloaded file, open console or green test suite alone.

## Rollback

For a code update, stop managed workers safely and click **Restore previous**.
Private data and supplier profiles remain in place; the rejected version is
blocked. For first-migration rollback, stop managed workers, return to the
unchanged original installations, and restore the backed-up Haynes Startup
shortcut if its previous automatic start is wanted. Do not delete the existing
profile/token folders. A corrupt stable bootstrap or missing first release needs
support; there is no invented recovery success if no previous version exists.
