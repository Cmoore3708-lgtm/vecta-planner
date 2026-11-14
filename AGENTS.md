# VECTA repository instructions

Read `RELEASE-SAFETY.md` before releases.

## Standing authorisation — 14 November 2026

Chris requested: "Can you change the rules so I don’t have to keep saying I approve or Push to main".

- When Chris asks for a fix or change, treat that request as authorisation to implement it, push the amendment branch to `Cmoore3708-lgtm/vecta-planner`, open a PR, run the required checks, merge to `main` and deploy the requested change. Do not ask again for "I approve" or "Push to main".
- Complete the release and verification within the authorised scope, including the mechanics aliases when affected, and report the outcome and any verification gaps.
- A later instruction such as "preview only", "do not deploy", "wait" or "show me options" limits that task. A request for advice or a review alone is not an instruction to release changes.
- Keep the PR workflow, release gate, Test/Main isolation, dashboard layout lock, protected-area tests and rollback safeguards. Standing authorisation never permits bypassing a failed check or claiming an unverified result.
- Ask only when a necessary decision is genuinely missing or an action is outside the request and existing authorisation, especially destructive production-data changes, new costs, customer communications, supplier orders or disruptive workshop-PC work. Reuse authorisation already given; do not ask for it a second time.
- Existing specific restrictions on live supplier tests, supplier settings and workshop-PC installations continue to apply unless Chris authorises those actions. Preparing and releasing requested worker code does not itself authorise disrupting the working PC or supplier sessions.
- This standing authorisation replaces the former requirement for separate approval of each tested preview/Main release. It applies to subsequent tasks in this repository until Chris changes it.

## Dashboard display is approved and locked

Read `DASHBOARD-LAYOUT-LOCK.md` before changing the planner, dashboard header, desktop/phone job cards, shared dashboard styles, or mechanics build.

- Preserve Chris's approved PC and phone layout during unrelated updates.
- Do not update `docs/dashboard-layout-baseline.json`, weaken/remove its checks, or bypass `scripts/dashboard-layout-lock.mjs` merely to get tests/builds to pass.
- A baseline change requires an explicit user request or approval for that dashboard layout change. Record the request and reason and verify Main and mechanics on PC and phone before intentionally recapturing it.
- If a layout lock fails during unrelated work, fix the unintended change and keep the baseline intact.
- Main and mechanics share dashboard job rendering and CSS. Mechanics retain their separate login, non-financial navigation and completion workflow.
- For releases affecting shared planner code/styles, update and verify both mechanics aliases as documented in `DASHBOARD-LAYOUT-LOCK.md`; a Main deployment does not automatically move those manual aliases.
