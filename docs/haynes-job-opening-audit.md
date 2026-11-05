# Haynes job-opening audit — 5 November 2026

## Findings and changes

| Path | Finding | Result |
| --- | --- | --- |
| Main and mechanics job cards | A usable saved model drawing marked `generic` was treated as a missing image. | Any compatible saved drawing satisfies decoration; no technical lookup is needed to improve its classification. |
| Fleet image choices | Display included the linked fleet ID, but the recovery check omitted it. | Both use the same description and fleet ID, including manual artwork. |
| Initial card setup | A shortcut invoked lookup when an identity had an image, before checking the expected make or a separate manual choice. | Initial rendering stays local; cached identity fills missing new-booking fields without a request. |
| Automatic recovery | Opening a job used foreground retry semantics and could force an authenticated retry after a failure or image-less match. | Automatic work honours persisted failure cooldowns and never sets `retry=1`. Only the Haynes button can force refresh. |
| Cold-browser identity | The server's permanent identity was rejected by the client's 24-hour snapshot validation. | Permanent identity is accepted without altering its timestamp; the short-lived snapshot still expires. Registration, make, structure and future-date validation remain. |
| Shared artwork | Batch loading alone could be stale, capped, or unavailable. | Wait for hydration, then check the requested registration/model in the existing saved-artwork endpoint before a worker request. Unavailable storage is not treated as confirmed absence. |
| Delayed responses | An editor or registration can change while artwork is loading. | Recheck the current editor, registration and generation before starting work or applying results. |

The automatic first lookup for a genuinely missing vehicle remains available.
The Haynes button still opens the technical vehicle page and explicitly refreshes
the match. A correct model drawing never supplies engine/variant/service data.

## Other paths inspected

- Planner/calendar and fleet rendering already use saved artwork and model
  catalogues, rather than vehicle-worker requests.
- Normal SVG rendering uses the permanent source store and browser rendering
  caches. Reading `/api/haynes-image` is an image request, not a PC browser lookup.
- The public booking flow keeps artwork separate from technical identification;
  the server returns saved identity before calling the relay.
- Service sheets, service prices and repair-time requests may legitimately use
  Haynes for service/technical data. Job-pricing mounting does not itself refresh
  saved service prices; a selection or explicit refresh initiates that work.
- Worker and relay caches, single-flight requests and daily allowances remain
  intact. No PC worker update, schema migration or production data edit is needed.

## Evidence and verification

A read-only relay audit for 4 November 08:30 through 5 November 08:30 UTC found
61 requests for 38 registrations, including 23 forced retries. The relay does
not record whether a request came from a card opening, an explicit click, or
another workflow, so these counts are not all attributable to this bug. The live
artwork store contained 174 registration drawings, including 34 generic model
choices; the permanent identity store contained 121 records.

The new behavioral regression scenarios reproduce 11 failures against the
unchanged Main helper. They cover model drawings, fleet/manual choices, older
server identities, reopen/reload, cache failures, explicit refresh and stale
responses. Tests use stubbed requests and do not operate the workshop PC.

`npm run release:gate` checks all regression tests, phone/cloud integrity,
financial integrity, the production build and the unchanged Main/mechanics
desktop/phone layout baseline. Install the locked worker test dependencies as
CI does: `npm ci --prefix workers/haynes --ignore-scripts`.

Local browser smoke testing opened existing job cards using synthetic offline
records; saved model selection avoided the lookup status. The local Vite preview
does not execute Vercel image APIs, so it could not verify live image rendering,
the actual PC queue, or the full device/offline/reconnection release matrix.
Those remain release verification requirements; no live speed improvement is
claimed from the automated tests alone. Main and both mechanics aliases must
receive the same approved commit when this is released.
