# Faster vehicle identification

The Windows relay keeps one vehicle lookup tab after a successful lookup. It uses
that tab's existing number plate input for the next vehicle, navigating back to
the supplier search only when the field is unavailable. Failed/timed-out tabs
are discarded. Service lookups still use separate request-owned pages.

The dashboard yellow plate starts an identity lookup 650 ms after a complete
modern UK registration is entered. Submitting uses the existing pending/cached
lookup. Short/personalised plates continue to work on submission. Booking starts
Haynes alongside the MOT request after the same input pause, sharing that early
request with the subsequent make-validated display. Incomplete plates are not
sent to Haynes speculatively. Registration checks reject stale vehicle results.

## Windows update

Deploying the front end does not update the workshop PC. Stop its worker with
Ctrl+C, replace `workers/haynes` and `lib/haynes-vehicle.js` plus
`lib/haynes-service.js` from this revision in the existing project folder, then
run `workers/haynes/windows-connect.cmd`. Preserve the existing encrypted pairing
and dedicated Edge profile. Include the new `vehicle-browser.mjs` file.

## Verification

Regression fixtures cover reuse without a new tab/navigation, fallback when the
plate field disappears, stale results, login failure, service-tab isolation,
failed-tab disposal and early-request sharing. These are simulated supplier
pages; real timing and the current supplier result-page input require a check
on the signed-in workshop PC. Idle relay polling and supplier response time still
contribute latency. This does not mirror individual keystrokes to a shared tab.
