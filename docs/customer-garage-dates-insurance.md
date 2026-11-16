# My Garage automatic dates and insurance photo

Requested by Chris on 16 November 2026. The change is authorised for release by AGENTS.md.

- Adding a car stores the official MOT expiry and DVLA tax date. Cars with no MOT history get a first-MOT reminder calculated from their first-use date, using the same day-before-third-anniversary convention as the existing workshop. Official expiry dates always take precedence. Calculated dates are labelled; failed/partial lookups and MOT-exempt records do not invent a first-MOT date.
- Automatic annual service mode shows the nearest confirmed, unfinished service booking. Rescheduling moves that displayed date. Once completed, the next annual reminder is 12 months after the visit's booking date. Cancelled/provisional jobs and safety/DPF checks are excluded. Customers can opt out and enter an external service date; preference saves do not freeze an automatically derived date. No workshop job or invoice is modified.
- Optional insurance photography is under Manage car. Camera and photo-library input are compressed to JPEG, re-encoded server-side without EXIF, and kept in a private Storage bucket. Renewal dates remain explicit customer input; no OCR is performed.
- Every upload/view/remove authenticates the garage session and checks ownership of the exact car UUID. Adding another owner's registration does not grant document access. Downloads return only through a no-store authenticated response, with no public/signed URL or offline document cache.
- Replacements use unique object IDs with compare-and-swap metadata. A losing concurrent upload is removed. Failed old-file cleanup retains the object ID for retry on replacement/removal. Removing a car removes its insurance images first; concurrent edits cause a refresh error rather than silently deleting a newer record.

## Database rollout

Apply `20261116075950_customer_garage_insurance.sql` to Test first, then Main before releasing the server. It adds nullable metadata and an empty cleanup array to existing garage rows, plus a private JPEG-only 1.8 MB bucket. Existing table RLS and service-only grants remain intact; no browser Storage policies are added. The previous app release remains compatible with these additive columns.

## Verification

31 targeted garage tests pass, covering automatic dates, rescheduling/completion, ownership, upload/view/replace/remove, malformed files, storage failure, concurrency and the upgrade migration. Full release gate passed: 1,997 regression tests passed, four skipped, zero failures; phone/cloud sync, finance integrity, build and dashboard layout locks passed. Re-run the gate after integrating any newer Main commit.

Phone-width UI exercised with synthetic data and a disposable sample image only: upload, view and date save. No real booking, sign-in email, push, supplier session or customer document was used for QA. Real iPhone camera/HEIC capture remains a device check.

The Test advisor reports no new insurance/garage warning. Existing unrelated trigger-function and Auth configuration notices are outside this amendment. Roll back to the preceding production deployment if production verification fails; retain the additive private schema so uploaded documents are not destroyed.
