# Workshop Pro file-size assessment — 15 October 2026

Baseline: Main commit `1c4f23d` (includes #211). Measurements are local production builds of identical application source, before and after build-only optimisation. Decimal MB/kB. Gzip figures use Node gzip per resource, not a measured browser transfer; hosting compression and cache state affect actual downloads.

## Findings and measured result

| Item | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Main HTML plus three application scripts | 2,230,157 B | 1,794,240 B | 19.5% |
| Same resources, gzip | 414,844 B | 374,180 B | 9.8% |
| HTML alone | 484,931 B | 448,405 B | 7.5% |
| HTML and all 23 directly linked local JS/CSS resources | 2,432,755 B | 1,985,425 B | 18.4% |
| Same directly linked resources, gzip | 472,001 B | 426,771 B | 9.6% |

The editable `index.html` remains 2,229,911 bytes. Reducing what devices receive is distinct from splitting the source into smaller files. The previous build already extracted three large classic scripts, but did not compact them. Vite's initial size log describes the file *before* the post-build splitter and therefore does not describe the delivered HTML.

Embedded fleet and historical seed objects account for substantial repetition: the original lines include about 90 kB of fleet vehicles, 150 kB of contractor jobs, 39 kB of contractor vehicles, 322 kB of NMUK jobs and 16 kB of completion evidence. Build-only schema/row encoding removes 308,123 bytes before whitespace minification. These are historical recovery inputs and financial evidence; removing them or replacing them with a network dependency would be a functional change.

The source also contains approximately 338 kB of style text and many accumulated overrides. Some print-template CSS is inside JavaScript strings. Broad text-based CSS extraction or blanket deletion of apparently duplicated selectors would be unsafe. The customer-invoice stylesheet is about 267 kB but is not part of the manager's directly linked initial resources; shrinking it would not deliver the same initial-load benefit. Large photographic assets and duplicate logo files affect other routes or deployment size, not the measured manager HTML/scripts payload.

## Implemented

1. Encode five allowlisted, literal JSON record arrays at build time. Reconstruct them synchronously at their existing assignments with identical record order, key order, values, nulls and absent fields. Source data remains readable and unchanged.
2. Minify whitespace/comments in classic inline scripts and the seven already-hashed Haynes/artwork helper assets. Preserve identifiers and function names; disable syntax optimisation and identifier mangling. Keep existing execution order and blocking/deferred attributes.
3. Compact real inline style elements in place, preserving IDs, positions and cascade. Skip scripts (including their embedded print templates); retain any CSS which generates parser warnings.
4. Keep hashed asset URLs and existing manager-only protection of `vecta-inline-*` assets. Include build-optimiser source in the worker release fingerprint, so optimiser-only changes notify existing clients.
5. Make production builds verify JavaScript parsing, style identity/order, content hashes, linkage to all three protected scripts and size budgets (1.9 MB raw / 400 kB gzip for the main payload). Budget overruns fail the build instead of silently regrowing.

No application source business rules, data writes, database schemas, migration behaviour, cache ownership, image quality, website content or worker installation files are changed. Existing historical data still reaches the browser; this is compact representation, not data removal.

## Verification

630 regression tests passed, including seven new encoding tests. Each of the five complete production seed arrays is executed after encoding and compared using exact JSON serialization against its original. Mixed schemas, absent fields, nulls, zero, false, Unicode and nested values are covered. Executable assignments are excluded from encoding.

All seven integration tests, phone/cloud sync integrity, finance integrity and production build passed. Built scripts parse successfully, all content hashes match, and style elements retain their original identity/order. The Haynes worker dependencies must be installed separately (`npm ci --prefix workers/haynes`) before the regression suite; they are not manager runtime dependencies.

These checks do not substitute for physical iPhone acceptance or prove a live deployment has the new payload. Real-world startup timing has not been measured. This change reduces payload; it does not eliminate server lookups or the separate offline shell dependency-fetch work.

## Remaining options, in recommended order

| Option | Benefit | Decision |
| --- | --- | --- |
| Split editable application source into maintained JS/data/CSS files | Smaller individual source files, cleaner ownership and more selective cache invalidation; no inherent total-byte saving | Separate refactor. Many regression fixtures inspect `index.html` and would need deliberate migration. Keep script order and protected paths. |
| Consolidate historical override scripts | Potentially less execution and duplicate logic | Requires feature-by-feature tracing and behaviour tests. Do not delete version-labelled patches just because newer ones exist. |
| Consolidate CSS overrides | Potential savings and simpler layout maintenance | Requires desktop/mobile/print visual comparisons for planner, fleet, invoices and service sheets. This batch preserves the cascade. |
| Remove historical bootstrap seeds after a proven server migration | Larger raw-byte reduction | Defer. Requires evidence that every seed is durably stored, plus tested cold-start, restore, offline and reconciliation behaviour. |
| Lazy-load fleet/finance modules | Lower initial parsing cost | Defer. Current shared globals and offline startup depend on synchronous availability. Requires module-boundary work. |
| Recompress photos or remove duplicate logos | Lower website or deployment bytes | Separate route-specific work. No image-quality reduction included here. |
| Broad identifier mangling, aggressive dead-code removal or whole-site HTML minification | Further byte savings | Excluded: globals, print templates and whitespace-sensitive content make this a higher-risk first step. |

Recommendation: ship the measured build-only reduction, keep the budgets, then leave larger architectural work for a dedicated stabilisation window. A smaller single source file is not worth breaking fleet history, invoices or offline recovery.
