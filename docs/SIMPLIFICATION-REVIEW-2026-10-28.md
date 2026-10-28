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

## Implemented in this amendment

`workers/control/workshop-workers.ps1` prepares one **Start VECTA Workers**
desktop shortcut using the existing installations. Setup selects the actual
working launchers rather than guessing among Downloads/Documents copies. It
stores only paths in the current Windows account, preserves pairing and
profiles, checks dependencies, skips detected runners, and reports failures per
worker. It does not add another supplier process, npm install, automatic update,
sign-in startup entry, production queue flag or website deployment.

This is prepared source only. Windows PowerShell/COM, the actual installation
selection and supplier sessions cannot be verified in this Linux session.
Follow the Windows acceptance checklist in `workers/control/README.md` before
calling the shortcut ready. Existing startup scripts and working installations
remain the rollback. The new controller does not supervise crashes or establish
end-to-end supplier health.

## Ordered work remaining

1. Complete one assisted workshop-PC acceptance session for the desktop shortcut.
   An operator should locate the existing working installations; Chris should
   not have to diagnose paths or repeat supplier setup. No PC access is available
   in this session, so the shortcut cannot be installed remotely here.
2. Record installed versions and actual successful lookups for all three workers.
   Verify cold startup, duplicate clicks, lost network, sign-in expiry and
   sleep/resume. Identify the real installed deficiencies before issuing updates.
3. Consolidate to one stable installation and one documented, compatible release
   package, preserving profiles/pairing. Validate migration and rollback before
   moving anything. Current launcher deliberately does not perform migration.
4. Add trustworthy unified worker health and bounded crash recovery. Show one
   actionable message for sign-in or pairing rather than prescribing new
   downloads. Keep supplier fallback prices/availability states honest when
   live evidence is unavailable; verify booking behaviour under each failure.
5. Replace ad hoc file updates with staged, versioned releases. Before enabling
   any unattended updater, prove integrity checking, dependency compatibility,
   idle-time switching, no in-flight quote interruption and rollback. Never
   silently update from the moving tip of Main.
6. Consider hosted workers or direct supplier APIs only after supplier support,
   authentication, cost and reliability are verified. Local signed-in browser
   automation cannot promise 24/7 operation while the PC sleeps. A hosting move
   is a separate architecture decision, not a necessary first step to get one
   desktop button.

No production application, supplier account, database record, reminder schedule
or customer message was changed by this review. The sole immediate operational
change is pausing the independent cleanup automation. No promise of all-time
availability is made. Native PC/iPhone/iPad, live supplier and financial save
flows remain outside the checks performed here.
