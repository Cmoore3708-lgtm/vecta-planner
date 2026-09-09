# VECTA regression safety suite

These tests protect the current critical behaviour before the application is simplified.

- `npm test` runs the regression checks.
- `npm run test:integration` runs against the isolated Supabase development branch and refuses to run against production.
- `npm run build` must also pass before any deployment.
- Tests use synthetic records only and never connect to the production database.
- The Supabase development branch is the only permitted database for future integration tests.

Production deployment must remain a separate, explicit approval step.
