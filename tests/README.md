# VECTA regression safety suite

These tests protect the current critical behaviour before the application is simplified.

- `npm test` runs the regression checks.
- `npm run test:integration` runs against the isolated Supabase development branch and refuses to run against production.
- `npm run build` must also pass before any deployment.
- Tests use synthetic records only and never connect to the production database.
- The Supabase development branch is the only permitted database for future integration tests.
- Preview deployments have a hard safety lock: they fail closed unless dedicated test-database variables are configured, and they reject the production project address.

## Required iPhone check before a notification release

1. Allow VECTA Pro in every Focus mode used on the test iPhone.
2. Fully close VECTA Pro and lock the phone.
3. Submit a synthetic website booking.
4. Confirm the banner, sound and badge arrive without opening VECTA Pro.
5. Tap the notification and confirm Website Bookings opens with the new request.

Production deployment must remain a separate, explicit approval step.
