# One desktop shortcut for the existing workers

Status: prepared for Windows acceptance testing, not installed or verified on
the workshop PC. This is an additive launcher, not a new supplier worker or an
automatic updater. No website deployment is required for this launcher.

An operator familiar with the current PC installations runs
`Install-Desktop-Shortcut.cmd` once and selects the existing Haynes
`windows-connect.cmd`, tyre `START-LIVE-TYRE-PRICES.cmd`, and combined GSF
`START-LIVE-REPAIR-QUOTES.cmd`. Root package shortcuts and inner worker shortcuts
are supported. Setup validates the existing dependencies and pairing files,
copies only this controller into `%LOCALAPPDATA%\VectaWorkers`, and creates
**Start VECTA Workers** on the current account's Desktop. It saves paths only;
it does not copy passwords, tokens or supplier browser profiles.

Daily use: double-click **Start VECTA Workers**. Existing runners are skipped;
missing setup is reported separately for each worker so the others can start.
The three existing interactive consoles and supplier browsers remain visible.
Keep them open and keep the PC signed in, awake and connected. The summary says
**start requested**, never **connected** without supplier verification.

The controller preflights installed Playwright before invoking existing launchers
so their dependency-install branches are not normally entered. It does not run
npm, fetch updates, change pairing, enable production queues, or enable Windows
sign-in startup. Repair and service pricing share the existing GSF worker.
Preview-only GSF pairing is deliberately not substituted for the live pairing.
If the PC has only preview setup, report the gap rather than silently changing it.

Existing installation folders must stay in place. This first step removes daily
launcher hunting; it does not consolidate or update those installations.

## Windows acceptance checklist

Run with the same Windows account as the current supplier sessions:

1. Select actual installed launchers (both root and nested layouts), including
   paths containing spaces. Cancel setup and verify no configuration is changed.
2. Start once with no workers running. Verify all three actual relay connections,
   correct environments, and an approved read-only lookup per supplier. Process
   launch alone is insufficient evidence.
3. Click twice rapidly and again after launch. Verify no extra worker/profile,
   supplier login or queue consumer starts. Test older independently launched
   runners too. Conservative process detection may skip an unrelated `worker.mjs`;
   investigate instead of killing it or forcing a duplicate.
4. Remove a synthetic installation's dependency/config file. Confirm that worker
   reports missing setup, the other workers start, and no npm/network installation
   occurs. Restore the fixture; never delete real pairing or profile data.
5. Test expired supplier sign-in, lost network, closed Edge, PC restart and
   sleep/resume. Confirm failures remain visible; no claim of automatic session
   recovery or crash supervision is made for this controller.
6. Verify the existing Haynes Startup shortcut, if present, still launches only
   one runner. This installer does not remove or replace it.

Rollback: delete **Start VECTA Workers** and `%LOCALAPPDATA%\VectaWorkers`.
Existing installations, credentials, desktop shortcuts and startup entries
are untouched. Do not remove `%LOCALAPPDATA%\VectaHaynes`, `VectaGSF`,
`VectaTyres` or `VectaRepairQuotes`.
