# Existing mechanics dashboard

The mechanics aliases must serve the distinct generated `mechanic.html` entry,
never Main's `index.html`. Middleware authenticates their separate shared login
and rewrites their page requests to this entry. Main application chunks are
rejected on mechanics hosts. Main retains its own login and entry.

The mechanics entry uses the CURRENT Main planner function, three technician
columns, right-side unallocated/quote backlog, registration lookup and search,
and shared responsive CSS. Never reinstate the obsolete September planner or
its full-width/above-planner backlog styles. Only financial/management navigation,
the day-money control, invoice search results and quote actions are removed.

The original mechanics history view was recovered from production deployment
`dpl_AR2goceeCEXR1iVxp4XBdDfWApC8`; its non-financial Completed Jobs view is
recorded in `scripts/original-mechanic-variant.json`. The original planner/layout
functions are deliberately not retained as build inputs. Current saves, images,
authentication and offline behaviour continue through the shared up-to-date core.

Mechanics use `work_complete` as an intermediate stage. Complete saves the current
job card through the existing guarded save flow; it does not invoice, archive or
set a final completion timestamp. Contacts remain editable beneath the vehicle
image, beside Haynes tools. Work required is large/full width. Job types, booking
calendar/planner, pricing and management/delete actions are absent from the card.
Hidden form values remain intact for safe existing saves.

Both Main and mechanics entries use the project's existing configured database
and API session flow. This is the original UI separation, not a new database role.
Do not claim a separate finance RLS role without implementing and testing one.

After a production release, verify that the two mechanics aliases point to that
release and that authenticated `/` serves the mechanics build marker, two-item
navigation and mechanics chunks. Test Main separately; its management tools must
remain unchanged. Preview uses `/mechanic.html` against isolated Test data.

The catch-all proxy in this folder is historical only; do not deploy it as a
mechanics recovery. It would replace the distinct mechanics entry with Main.
