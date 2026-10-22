# VECTA repository instructions

Read `RELEASE-SAFETY.md` before releases.

## Dashboard display is approved and locked

Read `DASHBOARD-LAYOUT-LOCK.md` before changing the planner, dashboard header, desktop/phone job cards, shared dashboard styles, or mechanics build.

- Preserve Chris's approved PC and phone layout during unrelated updates.
- Do not update `docs/dashboard-layout-baseline.json`, weaken/remove its checks, or bypass `scripts/dashboard-layout-lock.mjs` merely to get tests/builds to pass.
- A baseline change requires an explicit user request or approval for that dashboard layout change. Record the request and reason and verify Main and mechanics on PC and phone before intentionally recapturing it.
- If a layout lock fails during unrelated work, fix the unintended change and keep the baseline intact.
- Main and mechanics share dashboard job rendering and CSS. Mechanics retain their separate login, non-financial navigation and completion workflow.
- For releases affecting shared planner code/styles, update and verify both mechanics aliases as documented in `DASHBOARD-LAYOUT-LOCK.md`; a Main deployment does not automatically move those manual aliases.
