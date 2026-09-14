# VECTA Workshop Pro — Synthetic Test System

This branch is the isolated public test environment. It must never connect to
the live VECTA database or be deployed over the live Workshop Pro project.

The application source is at the repository root. `dist/` contains the exact
static package published by the separate test project. Synthetic records are
defined in `test-fixtures.sql`.

## Safety checks

Run `npm test` before publishing. The regression suite verifies database
isolation, synthetic-data sanitisation, finance rules, job and invoice
lifecycle rules, synchronisation, offline fallback and website bookings.

Run `npm run verify:browser` for the desktop check and
`npm run verify:browser:mobile` for the phone-sized check.
