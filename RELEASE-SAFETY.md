# VECTA release safety rules

The current approved recovery point is the Git tag `V355-approved-stable`.

## Non-negotiable release process

1. Create one `amendment/<short-name>` branch for one amendment.
2. Never make an application amendment directly on `main`.
3. Open a pull request and wait for `VECTA Release Gate / Verify workshop safety` to pass.
4. Test the Vercel preview on desktop, iPhone and the mechanics' iPad.
5. Check Dashboard, Fleet Manager, Jobs, Financial, Invoices and Website Bookings.
6. On iPhone, test a cold start, a second reopen, offline last-known data and reconnection.
7. Compare the preview with production for unrelated changes.
8. Merge only after Chris explicitly approves the tested preview.
9. After production verification, create the next `Vxxx-approved-stable` tag.

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
