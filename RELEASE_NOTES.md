# VECTA Workshop Pro

## 16 September 2026 — Test build V318

- Fleet maintenance due rows now fit within a phone screen without horizontal scrolling.
- Alfie is blocked out in red from 14:30 to 17:00 every Friday, including booking-conflict protection.
- Completing a Tow Bar Removal job now reminds the user: “Have you wrote the name on the towbar?”
- The production build extracts the three oversized embedded scripts, reducing the deployed `index.html` from about 2.1 MB to about 465 KB while retaining offline caching.

## 9 September 2026 — Finance integrity

- Invoice saves now require cloud confirmation, verify the saved number, value and linked job, and retain a protected invoice snapshot.
- Invoice numbers and job links are unique in the database, preventing reused numbers and duplicate invoices for one job.
- Payment methods now save directly to the invoice record and update across devices through live synchronisation.
- Hold over now assigns completed work to the following month instead of merely hiding it from the original month.

## 9 September 2026

- Job cards now recognise a completed six-month safety check in the current maintenance cycle, instead of continuing to show the superseded due date in red.
- Internal fleet servicing now selects the latest completed service by its actual workshop date before calculating the next annual due date.
- Printing an invoice now saves it automatically, closes the invoice workflow and returns to the Dashboard.
- Added Email to Customer beside Print/PDF; it confirms the save, closes the invoice and opens a pre-addressed, pre-written customer email.

## v1.17

- Restored the supplied VECTA logo in the planner sidebar.
- Added the supplied logo to invoice screen/print and service sheet print.
- Planner cards now show Job Type on the right beneath Time, Status and Ramp.
- Removed Work Required text from planner cards.
- Repaired preset job template layout in Settings.
- Removed the up/down arrow controls; drag handle reordering remains.
- Widened and aligned Name, Description, Hours and Price fields.
