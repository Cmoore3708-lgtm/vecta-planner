# VECTA operational simplification review — 28 October 2026

The operating model asks too much of the garage owner. Three supplier workers
have accumulated separate download packages, startup methods, diagnostics and
release states. Installing another special-purpose package for each fix is not
a sustainable support process. Preserve the garage's functions and financial
safeguards while reducing the number of things Chris must operate.

## Verified current state

Reviewed repository Main `e4fbdfe35df3e6c49dfaa669f483d0261381c04b`, worker
entry points/profiles/pairing/startup scripts, package builders, release rules,
production manifest, hosting routes/crons, open PR summaries and ChatGPT tasks.
This is a source and operational review, not proof of every signed-in workflow
or a database performance/security audit.

| Check | Observation on 28 October |
| --- | --- |
| Public homepage and booking | Both HTTP 200 |
| Workshop homepage | Expected 401, Basic realm VECTA Main |
| Workshop cloud-health endpoint | HTTP 200, `ok: true` |
| Main configuration | Production project `jywufozycuwuoshlulwl` |
| Test configuration | Separate Test project `brqsejjykrubxuofavuu` |
| Planner production alias | READY, deployment `dpl_8nAvurfXuXYTZPmi2NW9NKCrZGya`, current Main |
| Public website aliases | READY, deployment `dpl_7DswBjKoeFNLLBkgwf5RBaCiRnT7`, same current Main |
| Installed Windows worker versions | Not observable from this session |
| Actual supplier lookups, expiry and Windows restart | Not exercised in this review |

## Findings and decisions

1. **Startup is fragmented.** Haynes uses `windows-connect.ps1`, tyres uses
   `start-live.ps1`, and the combined GSF/repair worker uses `start-paired.mjs`.
   There are 125 tracked files under workers, including historical setup and
   diagnostic entry points. File count alone is not a defect, but exposing
   competing launch methods to the operator is. Add one desktop entry point
   over the existing working installations before attempting to relocate them.
2. **Worker started does not mean supplier ready.** Pairing, network connectivity,
   browser profile locks, supplier login and successful lookup are different
   states. Current cloud health proves database reachability, not all three
   suppliers. A future unified status must distinguish Starting, Connected,
   Sign in required, Reconnecting and Stopped using real heartbeat/result
   evidence; never infer readiness from an open console.
3. **Release completion is split between cloud and PC.** Hosting cannot update
   already extracted Windows files. The latest two production aliases currently
   match, but that does not establish the installed worker version. Introduce
   one release record covering Main, public site, mechanics aliases, database
   compatibility and each installed worker version. A change is finished only
   after its actual required PC-to-website round trip works.
4. **Old instructions conflict with newer implementation.** For example the
   tyre README retains foundation-stage statements saying transport is not
   implemented, while `live-worker.mjs` contains a relay consumer. GSF documents
   also retain older test and trial-policy instructions. Preserve useful
   technical history separately; operator instructions should have one current
   startup procedure. Do not infer live configuration from an old README or
   merge a stale draft just because it sounds like a current fix.
5. **GSF already combines service and repair queues.** Keep that shared runner;
   do not add another service process/profile. Repair lookups use a separate
   Haynes profile from the vehicle/service worker, which must remain intact.
6. **Recovery is uneven.** Haynes includes browser recovery and an optional
   startup retry loop. Tyres retries relay failures but its launcher exits after
   a process failure. GSF stops for invalid pairing and reports expired login;
   some repair failure paths close supplier tabs. Open drafts #359 and #383
   discuss recovery changes, but their existence does not establish installation
   or current live need. Assess each against current source/PC behaviour before
   integrating; avoid blind endless restart loops on revoked pairing/login.
7. **Background tasks need clear ownership.** Of 25 ChatGPT task records,
   five were enabled at review time. Only Workshop Pro cleanup was authorised
   to change/release software autonomously; it is now paused to prevent overlap.
   The isolation monitor and status summary remain enabled. Unrelated property
   and DVLA watches remain unchanged. The repository also configures three
   hosting cron entries: fleet refresh and two seasonal reminder routes. These
   are distinct from PC workers; do not disable business workflows indiscriminately.
8. **The core application remains large.** Main's `index.html` is 18,031 lines.
   Existing source protection, finance checks, offline sync, dashboard lock and
   release rollback rules are valuable. A wholesale rewrite during active use
   would increase risk. Extract bounded subsystems only when a demonstrated
   defect or maintenance burden justifies it and behaviour can be verified.

## Implementation after Chris approved permanent installation

Chris subsequently asked for one permanent installation, the same desktop button
after amendments, and an end to running workers from downloaded folders. The
amendment now implements that system rather than the earlier shortcut-only
proposal: a stable bootstrap, a small Windows connection manager, separate
versioned releases and persistent settings, approved-channel updates, staged
pinned dependencies/import checks, atomic activation, cooperative stop and a
previous-version restore that blocks automatic reapply of a rejected version.

Existing supplier profiles and Windows-encrypted pairing remain in their current
locations. The initial migration imports the working GSF/repair configuration;
normal startup and later worker releases no longer depend on Downloads. A
verified tyre session no longer requires Enter on every managed start. Worker
status distinguishes relay reachability from supplier/login readiness. Website
amendments do not publish worker updates automatically.

The implementation and release/Windows checks are in this PR. See
`workers/control/README.md` for the operational contract and acceptance checks.
The first live approved channel, workshop-PC migration and actual supplier
acceptance are not yet completed. Native automated Windows checks use synthetic
sessions and cannot replace that acceptance.

## Remaining operational verification

1. Pass native Windows CI and complete one assisted workshop-PC migration using
   the exact final setup package. Verify the existing supplier accounts, settings,
   pricing policies and read-only lookups; do not create customer test records.
2. Prove safe stop, network loss, sign-in expiry, sleep/restart, duplicate desktop
   clicks, an approved update and restore with the same desktop button. Record
   installed versions and actual end-to-end results.
3. Configure required reviewers on `worker-production`, record PC acceptance,
   then publish the first separately approved worker channel. Source prepared,
   CI passed, channel published, PC installed and real lookup verified remain
   distinct evidence states.
4. Maintain one release record for cloud/database/mechanics/worker compatibility.
   Address demonstrated core-application defects in bounded amendments rather
   than a wholesale rewrite. Supplier APIs or hosted workers remain a separate
   evaluated architecture decision; local browser workers cannot promise 24/7
   availability while the PC sleeps.

No production application, supplier account, database record, reminder schedule
or customer message was changed by this review. The independent cleanup task
remains paused to prevent overlap. No worker updater has been installed on the
workshop PC, and no promise of all-time supplier availability is made.
