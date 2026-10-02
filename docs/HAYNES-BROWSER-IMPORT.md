# HaynesPro browser importer — first development version

## Scope and status

This version uses the user's signed-in HaynesPro session in Chrome or Edge on the same PC as the Vecta page. It does not use a supplier API, collect passwords, export cookies, or bypass sign-in or verification screens. Chris has instructed development to proceed assuming extraction rights.

The local importer, DOM reader and validation tests are implemented. The registration-search button and extraction selectors have been checked against the signed-in trial for FX69 XWU. Installing the helper and running the complete extension-to-Vecta workflow remains a required Test check. This is not a production-ready or unattended phone/iPad worker.

## One-time Test setup

1. Download this branch and extract `extensions/haynes-helper` to the workshop PC.
2. In Chrome open `chrome://extensions` (Edge: `edge://extensions`), enable Developer mode, choose Load unpacked and select that folder.
3. Sign in to HaynesPro in that browser normally. No credentials belong in Vecta or the repository.
4. Open the Vecta Test preview. Click the helper toolbar button and choose **Connect this Vecta page**. Grant access to that exact Test origin. Each new preview hostname needs connecting once; other websites are not automatically granted access.
5. Open an existing service job, choose **Get service data**, enter current mileage and usage conditions, confirm the suggested manufacturer interval, retrieve the data and choose **Apply and save service sheet**.

The helper opens a temporary inactive supplier tab and closes it after a successful lookup. An expired login, ambiguous variant, incomplete response or verification screen leaves that tab open for review and applies nothing. Sign in manually and retry when needed.

## Behaviour

- Current mileage starts blank because the existing job field can contain historic MOT mileage.
- Registration, supplier vehicle type and requested interval are checked before application.
- Manufacturer checklist, oil specification, fill quantity, required parts, standard labour and additional conditional work are imported as text into a separate service-sheet section.
- Imported checks start unchecked. Existing workshop checks, instructions and measurements stay intact.
- Additional replacement intervals are shown for history review rather than automatically treated as work due.
- Manufacturer intervals are not the same as Vecta Full/Major/Oil & Filter packages. Confirm the correct interval against service history.
- The suggested interval is an upper bound covering elapsed age and mileage, not an assertion that the work is due. Coverage exhaustion or ambiguous systems requires a manual choice.
- Existing selected manufacturer checks prevent replacement of that imported section.
- The supplier parts list is reference information on the sheet. This version does not create parts orders or alter cost prices, quotes, invoice amounts, completion status or fleet due dates directly.
- Applying uses the existing `saveServiceSheet` flow. That existing flow includes its normal fleet-date/completed-job reconciliation; this change does not introduce another database writer.
- Shared-save failure leaves the imported sheet visible for retry using the existing Save control. Existing local-save semantics remain in force.
- Saved HTML follows the existing service-record synchronisation, reopen and print workflow, including access from another device after successful shared saving. Lookup itself requires the PC helper.

## Required verification before Main

Run `npm run release:gate`. Then test an installed helper on the Vercel preview, including registration search, normal/severe systems, a second make, complete import, Save/reopen from another device, printable manufacturer section, a supplier sign-out, a closed supplier tab, concurrent clicks and a failed shared save. Confirm the helper never reads or alters prices, accounts or job completion. Run the desktop/iPhone/iPad checks in RELEASE-SAFETY.md and obtain Chris's preview approval before merging.

## Extension permissions and implementation

The supplier is the only required host permission. Optional access is granted to individual HTTPS Vecta origins through the popup. The bridge runs only on connected origins; the worker validates the sender origin and top-level frame. No remote scripts are loaded. Messages contain registration, current mileage, chosen usage and service interval; no customer contacts or workshop financial details are sent to HaynesPro.

The worker serialises lookups, uses bounded waits and validates supplier links against the HTTPS WorkshopData origin. It interacts with the visible pages only. It does not call their internal endpoints. DOM changes can break this integration and must fail closed until selectors are repaired.

## Next phase: mobile requests

For lookup from iPhone/iPad without the PC browser open, add a separately hosted browser worker with secure login/session management and a job request queue. Do not describe this extension as delivering that feature. Hosting and operating that worker is a separate setup step.
