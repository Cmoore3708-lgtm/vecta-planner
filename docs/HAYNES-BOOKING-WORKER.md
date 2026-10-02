# Haynes vehicle identification — Test development

## Implemented

`workers/haynes` is a separate Node/Playwright service using a dedicated persistent Chromium profile. It opens the supplier's registration-search UI and reads the visible vehicle overview: make, model/generation, engine description, engine code, model years and representative image. It does not call supplier APIs/internal endpoints, collect passwords, export session cookies, or read service schedules during booking.

`lib/haynes-proxy.js` (routed through the existing availability function) is a preview-only server-side proxy. `public/haynes-booking-test.html` is a read-only Test copy of the current website booking flow with Haynes enrichment added. Existing production booking pages and `api/vehicle-lookup.js` are untouched. The Test copy cannot submit bookings or retrieve returning-customer contact records. DVSA advisories, customer choices, recorded MOT mileage and pricing engine capacity stay independent of Haynes. Confirmed identity is held in the Test form only; production persistence is a later amendment.

The matched Haynes model is displayed separately so a customer can confirm or reject it. VIN is never returned. No displacement is inferred from an engine description or used to adjust guide prices. Different make, registration mismatch, incomplete data or multiple results retain the original DVSA information. Broken images are hidden without breaking identification. Supplier login expiry and verification screens stop automatic lookups, never bypass them.

The dedicated `/api/haynes-vehicle` rewrite dispatches to the existing availability function with `haynes=1`, avoiding an additional serverless function on the current Vercel plan. Ordinary availability requests retain their existing behavior.

## Current deployment limitation

The worker is implemented and tested with DOM fixtures, queue tests, an authenticated HTTP service and the booking-page DOM. A Vercel preview can show the page and its DVSA lookup. Unconfigured Haynes requests return `NOT_CONFIGURED` and display the unavailable fallback; this is not a working unattended Haynes deployment.

No connected persistent server or worker credentials are available in this development session. A persistent worker host, direct supplier login on that host, HTTPS and Vercel Preview environment configuration are required for an end-to-end live test. The earlier Chrome extension PR is separate and is not a substitute for this host.

## Host requirements and setup

Use a persistent Linux host with Node 22 or later, Chromium dependencies, a private desktop for manual login, an encrypted persistent disk, HTTPS reverse proxy, and private administrator access. One small instance is sufficient for the serial worker; confirm resource usage with actual traffic. Do not purchase hosting before agreeing the provider and running cost with Chris. The worker's profile must remain private and must not be copied out of the Cloud Browser or a normal personal Chrome profile.

On the host, clone this branch. Run:

```sh
cd workers/haynes
npm ci
npx playwright install --with-deps chromium
```

Configure `HAYNES_PROFILE_DIR` to a dedicated private persistent directory. With the worker stopped, run `npm run login` from the host's private desktop. Chris signs into the supplier directly in that browser and presses Enter in the terminal when the makes page is visible. The login helper does not read passwords or accept terms automatically. Close the browser before starting the worker; one profile cannot be used by two browser processes.

Generate a random secret of at least 32 characters through the host's secret manager. Configure `HAYNES_WORKER_TOKEN` on the worker. Run `npm start` as a non-root service account with a restart policy. It listens on localhost:8080 by default; expose only the worker HTTPS reverse proxy to Vercel. Do not expose Chromium debugging, desktop/VNC, profile storage or a web login panel publicly.

The Dockerfile can alternatively be built from the repository root with `docker build -f workers/haynes/Dockerfile .`. Mount the profile volume at `/data`, owned by the container's `pwuser`. Keep the container's Chromium sandbox enabled and use the official Playwright seccomp/user-namespace configuration appropriate to the host; do not disable sandboxing to work around an unsuitable host. The Dockerfile is supplied but has not been built in this workspace (Docker unavailable).

In Vercel, configure these variables **only for Preview / amendment/haynes-booking-worker**:

- `HAYNES_WORKER_URL`: the worker HTTPS origin, without credentials/query parameters.
- `HAYNES_WORKER_TOKEN`: the same secret as on the worker.

Redeploy the preview after configuring its environment. Never put either token or supplier credentials in browser JavaScript, git or a URL. The proxy is disabled in production regardless of environment variables; enabling production is a separate reviewed change.

## Operations

- Maximum three distinct queued/in-flight requests; identical registrations share one lookup.
- One supplier tab at a time, closed in all success/failure paths; a 23-second deadline closes hung tabs.
- Cache successful results for 24 hours, maximum 500 entries, in memory only. Restart clears the cache. Re-fetch after expiry so cherished-plate changes are not trusted indefinitely.
- Maximum 150 uncached lookups per UTC day; a worker restart resets this development quota. This is a resource guard, not billing accounting.
- Login/verification failures suspend new supplier requests for one minute; cached results can still be returned until their TTL expires.
- No automatic challenge solving, fingerprint modification, login retries or credential entry.
- `GET /health` requires the bearer token and reports `RUNNING`, not authenticated supplier readiness.
- `POST /lookup` requires the bearer token and accepts only `{ "registration": "FX69XWU" }`.
- Worker secrets/profile are host-managed. Logs do not include registrations, VINs, supplier page HTML, credentials or upstream errors.

For reauthentication, stop the worker, run the login helper on its private desktop, then restart. Monitoring should distinguish `LOGIN_REQUIRED`, `VERIFICATION_REQUIRED`, `BUSY`, `DAILY_LIMIT` and unavailable responses without recording vehicle identifiers. Before public release, add persistent rate limiting at the deployment edge and agree alert routing; preview protection and the worker's queue/quota are the development guardrails.

## Validation before completion

Run `npm run release:gate`. Automated tests cover model extraction, public field/image allowlists, wrong registration, ambiguous data, serialization, deduplication, cache expiry, queue/quota limits, expired-login circuit, HTTP authentication, production-disabled proxy, missing worker configuration, late client responses, conflicting make and the Test page's preserved DVSA fields/advisories and disabled submit.

Still required: build/run on the selected host, manual supplier login, worker-to-Vercel live registration lookup, a second make, an ambiguous variant, expired login/recovery, image rendering on desktop/iPhone/iPad, and restart/session persistence. Only the supplier UI for FX69 XWU was inspected live earlier; the worker has not yet run an authenticated live lookup. No Main merge or production data changes are part of this task.
