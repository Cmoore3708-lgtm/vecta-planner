# Tyre guide worker — initial implementation

Status: foundation only; not connected to public booking or a live supplier account.

Uses ESP Sellout as the final fully fitted VAT-inclusive guide price, without further markup. Prices use integer pennies. Public output omits cost and supplier account information. Each of three categories selects the cheapest eligible tyre with sufficient stock for the requested quantity. Missing categories remain unavailable.

Run `node --test workers/tyres/guide.test.mjs` from the repository root.

Install this worker’s dependencies first (`npm ci` inside workers/tyres). Run `node workers/tyres/login.mjs` from the repository root on the workshop PC to open a separate Edge profile for manual login. Never commit or upload that profile. TYRE_PROFILE_DIR can specify its location.

## Remaining work before release

1. Inspect the authenticated supplier DOM and implement a supplier adapter: width/profile/rim selectors, Search, completed-results marker, readRows. Ensure old results cannot be mistaken for a new completed search. Inspect pagination and numeric stock formatting.
2. Verify the Vecta price list, Include VAT and fitted add-ons settings during every lookup; fail closed if they change. The selector currently accepts verified settings, not an assumption.
3. Agree the brand category mapping with Chris. Test fixtures are illustrative and do not configure production classification. The current selection requires confirmed new, summer, non-run-flat tyres; special tyre guides need a separate explicit flow.
4. Live test multiple sizes, quantities, pagination, no results, login expiry and changed settings. Do not click Cart or Order.
5. Add a serialized queue with timeouts and bounded retries, private server authentication, short-lived cache and supplier rate limits. Connect the booking UI and preserve guide price/size/quantity/category in booking records. Failed lookups must allow an enquiry without a price.
6. Follow RELEASE-SAFETY.md and preview verification before public enablement.

No supplier password is embedded. No database or existing booking/invoice records are changed by this foundation.

## Setup progress

A separate Windows setup utility now collects an allowlisted DOM report for authenticated-page integration. See START-HERE.txt. The bounded serialized queue caches successful guides for five minutes, deduplicates concurrent requests, never caches failures, and stops after a timeout to avoid overlapping supplier searches. The authenticated supplier adapter and website integration remain incomplete.

## ESP report findings (20 October)

The uploaded v1 diagnostic identifies #FindProductsButton and #OrderWindowGrid, with a unique Sellout column. Search is an input submit, so Search verification now reads its value instead of innerText. Other search buttons exist and must not be selected. V1 omitted plain-text Width/Profile/Rim labels; v2 inspects adjacent text and bounded search-panel control metadata and includes five allowlisted product/Sellout/stock samples. The table reader remains unverified against live row markup. No width/profile/rim selectors, refresh-completion signal, stock-warehouse meaning or classification are assumed. Public pricing stays disconnected.

## ESP v2 report findings

V2 confirms #key2 (Profile), #key3 (Rim), #key4 (Speed), plus the first #key1 input in the same panel (inferred Width). ShowSellout and ShowVat are checked; ShowAddOns is unchecked, which is not overridden because Chris confirms Sellout is already fully fitted. The grid reports 51 rows but the strict reader extracts zero products. V3 records cell positions/classes without costs or arbitrary text, and runs two size searches with stale-result/size-mismatch checks. Actual search refresh, row alignment, stock meaning and price-list selection still need live verification.

Chris confirms Enquiry (image/tab to the right of the car) must be opened before tyre size entry. ensureEnquiry skips this when #key1 is already visible; otherwise it requires a uniquely visible control labelled Enquiry and waits for #key1. An unlabelled or ambiguous icon fails safely; its live identity still needs verification. The setup now explicitly instructs opening Enquiry.

## Live v3 success and remaining settings check

The returned report proves 225/45R17 -> 46 products and 205/55R16 -> 49 products, including Sellout samples. Product descriptions contain hidden SKU prefixes and duplicate tooltip text; the reader now strips both and rejects conflicting sizes. Initial field inventory reports VAT/Sellout checked, but the generic ID-based structure reader reports false. Duplicate hidden input IDs are a hypothesis, not yet proven: v4 targets checkbox inputs explicitly and fails ambiguous state. It records clean per-product guide catalogue data (without trade costs) for the two test sizes. No public price is authorised by these results until settings and price list pass verification. Brand tier mapping, special-tyre eligibility, stock fulfilment semantics and website transport remain outstanding.

## V4 verified settings and proposed tier selection

The uploaded report confirms one actual checkbox per setting, Sellout=true, VAT=true, Vecta price list and multiplier=1, before and after both searches. V4 captures 46 and 49 normalised catalogue rows. These are retained as a limited fixture without account/session or cost data.

`tiers.mjs` adds proposed configurable Vecta brand merchandising groups and narrow model-scoped supplier aliases. These are business rules for review, not supplier-certified categories. Clearly marked run-flat, winter and all-season products are excluded from the standard guide selection. Unknown aliases stay unclassified; selected products remain specificationUnverified until Chris checks the actual vehicle. Default stock is used conservatively without adding Company stock; its fulfilment meaning still needs confirming before live enablement.

Captured one-tyre results using these draft rules: 205/55R16 = Comforser £62, Lassa £74, Pirelli £95; 225/45R17 = Massimo £65, Kumho £82, Pirelli £105. Four 205/55R16 tyres instead choose the £101 Pirelli because the £95 line has only one unit. All amounts are unchanged Sellout values.

There are now 40 targeted tests, plus a dedicated read-only CI workflow. Website transport, booking persistence and public enablement are still not implemented. The interactive review artifact uses captured data, explicitly marked as a snapshot, and cannot book/order tyres.

## Booking cards integration (review branch)

The existing booking tyre section now uses a transparent photographic tyre in charcoal, red-outlined Budget/Mid-range/Premium cards. It has a debounced size lookup, one shared quantity (1–4), per-tyre and total guide prices, loading/unavailable states, stale-response rejection, a five-minute expiry and preserved NEVOS restrictions. The selected size, range, quantity and available guide are included in the existing booking work notes; they do not alter invoice totals or create supplier orders.

`POST /api/availability?tyres=1` validates customer input and forwards privately to `TYRE_WORKER_URL` (`https`, `/quote`) using `TYRE_WORKER_TOKEN` (at least 32 characters). The worker contract is `{status:'MATCHED',size,checkedAt,catalogue,settings}` using the normalised Sellout catalogue. The public route recomputes the three options and never returns trade Cost or supplier settings. Missing configuration, expired data or supplier errors return an unavailable state. There is **no live worker relay configured or `/quote` server enabled** in this branch. The long-running supplier runtime, refresh-completion handling for identical-result searches, brand-rule review, warehouse fulfilment confirmation and end-to-end live deployment remain outstanding.

The transparent image is `public/assets/tyre-guide-cutout.webp`, encoded from the user-approved built-in imagegen cutout. Final generation prompt: “Standalone upright three-quarter black tyre product photograph, tread on the left and central opening on the right, realistic rubber texture and studio lighting, transparent background, no text or branding.” It is generic illustrative artwork, not a photograph of a quoted model.

`node scripts/build-tyre-review-preview.mjs /absolute/output.html` produces a self-contained design preview from the actual booking card functions, styles, asset and captured catalogue. Its sample prices are visibly labelled as a snapshot; that preview and its mock transport are never copied into the deployed website.
