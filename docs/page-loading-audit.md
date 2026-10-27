# Workshop Pro page-loading audit

## Findings and amendment

Navigation previously ran a complete synchronous page render in the click handler. Fleet rendered every filtered vehicle/work item, and Jobs rendered every matching history row. Many invoice checks also rebuilt and deduplicated the entire active invoice collection. Invoice payment warnings repeatedly collected contractor names from all jobs.

- Navigation now paints the page title, active tab and opening status before scheduling page construction. A newer navigation invalidates the older scheduled render.
- Fleet and Jobs initially render 50 results, with a result count and Show 50 more. Filtering happens across the complete collection before applying this display window. A changed query, tab or group resets the window.
- One synchronous render shares an active invoice collection, invoice identity index and contractor-name collection. They are always released in `finally`, including on rendering failure. Array results are copied so callers cannot reorder the shared collection.
- Jobs registration search uses the same invoice index while searching every record.

Cloud reads, financial totals, due-date rules, exports, printed Fleet lists, job writes and offline reconciliation still use complete authoritative collections. No database migration or deletion is involved. The approved dashboard layout baseline is unchanged.

## Scope checked

Source review covered startup, navigation, cloud refresh, Dashboard, Fleet, Jobs, Financial, Invoices, Website Bookings, Parts, Settings, image enrichment and the production build pipeline. The raw HTML source is about 2.2 MB, but the existing production pipeline already compacts data and extracts script chunks. Source size alone is therefore not evidence of an equivalent HTML download.

Cold startup intentionally reconciles authoritative jobs before exposing the online diary, with an offline watchdog. This amendment retains that safeguard rather than showing stale jobs as current. Background sync remains separate from page navigation.

## Verification

- Added behaviour tests for invoice classification parity, scoped cache lifetime, contractor changes, independently sortable arrays, complete-collection search, display windows, cancellation of superseded navigation and complete Fleet printing/cloud reconciliation.
- Existing release gate covers regression, phone sync, finance integrity, production compilation and source/built Main/mechanics layout locks.
- Local Chromium browser checks used 1,200 synthetic jobs, 1,000 invoices and 240 vehicles, with external requests blocked. Checked all eight main sections at desktop and phone widths, Show more in Fleet/Jobs, registration search beyond the first batch and generated mechanics at iPad width. No browser page errors were recorded. These are local synthetic checks, not production latency measurements or testing on physical iOS hardware.

A live preview review and actual online/offline upgrade check remain required before merging. After an approved shared-code release, verify and move both mechanics aliases according to DASHBOARD-LAYOUT-LOCK.md.
