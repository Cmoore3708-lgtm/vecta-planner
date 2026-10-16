# Vehicle image audit — 16 October 2026

## Observed failure

J321 WPC was identified successfully on 15 October. Its Toyota Hilux drawing (`319009548.svgz`) remained in the relay result but was absent from the production shared artwork catalogue. The fleet's label, `HILUX INVINCIB X D-4D4WD DCB A`, also failed the fleet-specific exact-model comparison against `Hilux (GUN; GGN; LAN)`.

Sixteen shared image assignments existed at audit start; none contained colour. Twenty-two successful relay identities were recoverable. Nine missing artwork assignments were restored without overwriting existing choices, bringing the catalogue to 25. The 22 identities were copied to the permanent identity cache to avoid replaying their worker lookups. No contacts or VINs were copied.

## Findings and changes

### Follow-up: fresh desktop planner still showed a generic Hilux

The main app keeps `remoteClient` private inside its IIFE. The shared-artwork helper incorrectly read `window.remoteClient`, so real devices never queried the shared catalogue even though the recovered artwork and SVG sources were present. Earlier tests provided an artificial global connection and therefore missed the integration fault. A live getter now connects all helper reads and writes to the current authorised main-app client, including reconnects. A fresh-cache desktop planner regression uses the real Hilux job description with no global `remoteClient`; it reproduces the missing image before the fix and verifies the centrally stored drawing and colour afterward, with one catalogue read and no Haynes lookup.

| Area | Earlier behaviour | Resulting behaviour |
| --- | --- | --- |
| Fleet | Missing artwork could enqueue a Haynes donor lookup; exact model strings could reject the Hilux | Reads saved artwork; uses the same make/model compatibility rule as the planner; never queues a decorative lookup |
| Planner, unallocated, quotes | Local and shared caches could disagree; image error handlers could repaint a cartoon | Permanent exact artwork takes priority; a known image is retained through temporary load errors |
| Job cards | Opening or changing fields could automatically request vehicle identification | Opening/field changes use saved artwork; the explicit Haynes button remains available |
| Service/safety sheets | Opening could identify the vehicle again just to obtain its image | Uses shared saved artwork; mileage-aware service-data requests remain separate |
| Workshop and customer invoices | Some image tags fetched the supplier directly | SVG drawings use the stored same-origin image endpoint; signed metadata and financial calculations stay intact |
| Website booking | Identification could be repeated on the worker; images loaded directly from supplier | Previously saved identities return from the database; drawings use the stored image endpoint |
| Drawing files | URLs and device IndexedDB were retained, but server requests could refetch supplier SVGs after cache expiry | Each SVG source is stored permanently by asset ID in the database, with no expiry. Device sources and rendered variants remain cached |
| Colour | Mostly device-local; fresh devices could lose it | Official successful lookups retain colour centrally; the artwork catalogue loads colours alongside image assignments. Manual fleet colours retain priority |
| Model guesses | A later same-family result could displace a known drawing | Normal hydration/technical results cannot downgrade a saved exact image. Explicit refresh/correction can deliberately replace it |

## Storage and request rules

- `vehicle_artwork:<normalised registration>` contains only image assignment, make, model and optional colour.
- `vehicle_colour:<normalised registration>` preserves the first valid official colour; manual fleet selections remain on the individual fleet record.
- `vehicle_identity:<normalised registration>` contains the existing allowlisted identification fields. It does not contain service schedules, contacts, VINs, authentication data or supplier page HTML.
- `vehicle_image_source:<numeric asset filename>` contains the SVG drawing. It is fetched from the fixed supplier host only when the database confirms no saved source exists. Concurrent requests share an in-flight fetch. Database read failure does not trigger a supplier download.
- Regular app startup selects specific settings IDs/prefixes; it does not download the source SVG collection. The artwork catalogue selects only assignments and colours.
- SVG JSON remains inert and the existing client renderer rebuilds allowlisted drawing primitives. Direct image responses carry `nosniff` and a sandbox CSP that blocks scripts, external requests and document capabilities.
- No service-worker, RLS, financial calculation, invoice numbering, MOT/tax refresh or booking-capacity changes are required.

## Verification

Tests cover the real Fleet renderer with the Hilux trim description; repeated navigation without worker requests; blank-registration vehicle isolation; exact artwork retention; shared/offline colour; stored source reuse with the supplier unavailable; concurrent first downloads; database outage behaviour; unsafe asset rejection; service-sheet rendering; customer invoice rendering; booking response ordering; and explicit technical lookup flows. The complete release gate is required before merge.

## Live source-size finding

The Primastar source `319110408.svgz` returned 502 because its genuine supplier file declared 1,402,733 bytes, exceeding an inconsistent 1 MB header limit even though the reader, decompressor and client already permit 2 MB. Its decompressed source was 1,963,625 bytes; removing Illustrator editing data leaves a 902,384-byte drawing. The header limit now matches the existing 2 MB processing bound. A regression test exercises the large editing-payload path before stripping.

## Practical limit

A device that has never received a vehicle's artwork still needs connectivity to retrieve the stored copy. Browser storage can be cleared by the user/OS; the permanent server drawing then repopulates it. Temporary connection failure retains the saved assignment and never deliberately substitutes a cartoon for a known drawing. Service schedules and repair data can still call Haynes when the user requests them.
