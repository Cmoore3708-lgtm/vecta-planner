ND70 GUG ready-to-invoice and contact-details fix

Replace the root /index.html in GitHub with the index.html in this folder.
The booking-form files are included unchanged so this package remains compatible with the latest combined update.

Changes:
- Ready-to-invoice jobs no longer remain visible on the Dashboard planner.
- They remain available under Invoices and Jobs > Ready to Invoice.
- Saved customer name, phone and email are restored from the linked vehicle/customer record when a job card is reopened.
- If an older job has no vehicle/customer link, the system uses the latest saved contact details for the same registration.
