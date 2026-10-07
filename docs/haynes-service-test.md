# HaynesPro service sheets

The workshop service sheet displays a smaller Haynes vehicle image and engine/model details at the top right. Once current mileage is entered, the upgraded Workshop PC worker reads the matching vehicle's UK normal-condition service schedule and engine lubrication page.

It displays exact oil specification and capacity, mandatory schedule parts (including filters), and separate additional-work intervals. The suggested period uses the next mileage milestone and the latest elapsed age milestone from Haynes registration date, whichever is later. A technician must confirm the period against age, usage and replacement history. No parts are assumed overdue solely because total mileage exceeds a repeating interval. Severe-condition schedules and vehicles without supported mileage/month periods require checking directly in Haynes.

Opening a sheet does not mark manufacturer work completed or change service prices. Values are escaped; supplier HTML, VINs and credentials are not returned. Retrieved data, mileage, selected interval and confirmation are stored in the existing saved-sheet HTML. Saved sheets retain their snapshot; editing mileage invalidates the schedule and re-fetches it. Empty oil fields are filled only when one unambiguous engine-oil entry exists; technician edits are preserved.

## Workshop PC update

1. Stop the current Haynes window with Ctrl+C, then Y if prompted.
2. Copy the updated `workers/haynes` files into the existing worker folder and the updated `lib/haynes-service.js` into its adjacent `lib` folder. Keep the original folder location so its startup shortcut stays valid. A full branch ZIP may also be extracted, but moving to a different path requires reinstalling the existing startup shortcut from that folder.
3. Open `workers/haynes/windows-connect.cmd` in that folder. The existing Windows encrypted pairing token and Haynes Edge profile are reused; no new password or pairing code should be needed.
4. On Test, open a service sheet and enter the current odometer reading. Check the vehicle, oil values and schedule against Haynes, confirm the appropriate interval, save, reopen and print it.

The service API supports Preview and Main using the existing scoped relay credentials. Main booking lookups use the existing vehicle queue. The new service queue is separate, accepts the existing scoped site/worker credentials, is limited to two pending jobs and 50 new requests per 24 hours, and caches by exact registration+mileage+period for two hours. Old workers report `WORKER_UPDATE_REQUIRED` without consuming unsupported jobs. No production job database migration is used.

Test Supabase changes: `docs/sql/haynes-service-relay.sql`; function `haynes-service-relay` uses explicit hashed-token authentication, not public anon access. Do not apply this SQL to the production job database. Main uses the same separate relay as booking vehicle lookups; the Workshop PC must run the upgraded worker before service downloads are available.

## Further uses

Next candidates are a parts-ordering list, brake-fluid/coolant and timing-belt reminders backed by actual replacement history, vehicle-specific reset instructions, and repair torque/standard labour references. These should remain explicitly contextualised by engine, transmission and supplier applicability; labour reference times should not automatically overwrite agreed job prices.
