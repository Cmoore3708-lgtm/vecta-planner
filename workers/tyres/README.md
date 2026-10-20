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
