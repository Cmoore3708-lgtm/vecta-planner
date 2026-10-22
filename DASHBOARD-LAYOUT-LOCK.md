# Approved dashboard layout — 22 October 2026

Chris explicitly approved the current Main dashboard on PC and phone and requested the same job display for mechanics. Preserve that layout during all unrelated work.

## Enforced lock

`npm run layout:check` compares the Main and generated mechanics dashboard against `docs/dashboard-layout-baseline.json`. It protects dashboard rendering functions, responsive and global styles that affect the dashboard, injected card styles, and artwork placement helpers. Main and mechanics must use identical shared job display functions; their existing navigation/finance differences remain intentional.

Every production build runs this check before building **and against the generated Main and mechanics output**. The regression suite also runs the lock and proves that phone markup changes, late CSS overrides and removed customer labels are rejected. Therefore an unrelated update that changes the protected layout must fail, including a deployment built directly on Vercel.

This is an accidental-change guard, not a claim that a repository administrator cannot deliberately change code or disable a check.

## An intentional layout change

Only update this baseline when Chris explicitly requests or approves a dashboard layout change. Do not refresh it to fix a failing test or build. First identify the changed renderer/style, verify PC and phone layouts in Main and mechanics, then record Chris's request and the reason in the baseline approval metadata. Baseline updates must be isolated and explained in the PR. Keep the negative tests intact.

Job editors, service sheets and invoices are outside this dashboard lock unless their shared CSS also changes the dashboard. Behaviour/data changes inside a locked renderer need the same review because they can affect its output; prefer changing separate data helpers when suitable.

## Mechanics deployment

The mechanics hosts must point to the same approved production release as Main while serving their **generated mechanic entry** through middleware and retaining their separate login. The mechanics hostnames are manual aliases, so a normal Main deployment alone does not update them. After a release affecting shared planner code or styles:

1. Wait for the exact production commit to be READY.
2. Move both mechanics aliases to that deployment:
   - `vecta-mechanic-dashboard.vercel.app`
   - `vecta-mechanic-dashboard-vectaplanner.vercel.app`
3. Verify the alias deployment IDs/commit and mechanics entry marker. Do not point the mechanics host at Main HTML or restore an older mechanics fork.

The source/build guard catches accidental layout changes. This release procedure prevents mechanics from remaining on a stale display after an approved update.
