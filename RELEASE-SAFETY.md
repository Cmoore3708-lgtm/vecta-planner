# VECTA release safety rules

The current approved recovery point is the Git tag `V355-approved-stable`.

## Release authorisation

Follow the standing authorisation in `AGENTS.md`, recorded on 14 November 2026. Chris's request for a fix or change authorises implementation, branch push, PR, testing, merge to Main and deployment within that scope. A separate "I approve" or "Push to main" is not required. Respect any later instruction to hold, preview only or avoid deployment.

## Non-negotiable release process

1. Create one `amendment/<short-name>` branch for one amendment.
2. Never make an application amendment directly on `main`.
3. Open a pull request and wait for `VECTA Release Gate / Verify workshop safety` to pass.
4. Test the Vercel preview on desktop, iPhone and the mechanics' iPad.
5. Check Dashboard, Fleet Manager, Jobs, Financial, Invoices and Website Bookings.
6. On iPhone, test a cold start, a second reopen, offline last-known data and reconnection.
7. Compare the preview with production for unrelated changes.
8. Once the required checks and preview verification pass, merge under the standing authorisation in `AGENTS.md` unless Chris has explicitly limited the task. Do not pause for repeat approval.
9. After production verification, create the next `Vxxx-approved-stable` tag.

For documentation-only changes that do not affect application code, configuration, dependencies or generated output, review the exact diff and pass the release gate. Device/preview checks, mechanics alias moves and a new application recovery tag are not required for those documentation-only changes. Record that scope in the PR.

## Automatic gate

`npm run release:gate` must pass before release. It runs:

- startup, service-worker and fleet regression tests;
- phone/cloud synchronisation integrity tests;
- finance integrity tests;
- the production build.

The GitHub workflow has read-only repository permission. It can reject unsafe code but cannot patch `index.html`, commit changes or push replacement code.

## Protected areas

Changes to any of the following require explicit upgrade testing from the current stable release:

- `public/service-worker.js`, the sole deployed service-worker source;
- startup, focus, online/offline and reconnection handlers;
- Supabase reads, writes or reconciliation;
- invoice numbering, completion dates or financial totals;
- Fleet service, safety, MOT and tax due-date rules.

## Rollback

If production fails after a release, restore the deployment created from the latest `Vxxx-approved-stable` tag. Do not attempt a chain of live emergency amendments before restoring service.
