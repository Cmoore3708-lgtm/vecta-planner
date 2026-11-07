# Worker recovery update — 7 November 2026

Purpose: fewer failed lookups and fewer manual logins. A relay heartbeat proves contact, not a successful supplier lookup.

## Changes

- GSF service and repair quotes send their finished result before closing browser tabs. A lost acknowledgement retries the same result and lease; it does not repeat the supplier lookup. Cleanup has a deadline. A stuck browser retires the shared reader for its managed launcher to recover.
- The two GSF queues recognise a valid, unexpired working lease in the other queue as BUSY. Cached results and duplicate-request handling take precedence. The website retries BUSY with bounded delays while showing the existing guide option.
- The managed ESP reader no longer waits for Enter at startup. It can reuse the optional Windows-encrypted ESP login already supported by the standalone reader.
- Haynes vehicle and service lookups keep their existing shared Edge profile. Optional Windows-encrypted credentials recover the observed ordinary login form. Concurrent requests share one sign-in attempt. Only the exact supplier origin and login form receive credentials. Verification challenges are not automated. Rejected/interrupted sign-in attempts remain blocked across restarts until credentials are saved again.

## Installation

The website release and database migration do not install anything on the workshop PC.

Use the combined package. Run CHECK-FIRST. Stop the readers safely in Workshop Connections, close the panel, then run APPLY-REPAIR. For optional Haynes automatic sign-in, run SAVE-HAYNES-LOGIN while the readers are stopped, using the existing Haynes account. Save ESP credentials only if not already configured. Credentials are not included in the package or uploaded to Vecta.

The installer preserves catalogue adapters, settings and pairing, rejects unfamiliar GSF builds, stages an immutable release and retains the previous release for rollback. It does not kill running workers. Installation and supplier login recovery still require verification on Windows; isolated tests do not establish live supplier availability.

Validate a real vehicle lookup, a service-sheet lookup, a GSF service price, a repair quote and a tyre price. Check both the supplier result and its delivery to the requesting screen. A restart or fresh heartbeat alone is insufficient. Do not place test orders or customer bookings.

## Remaining limitations

- The repair-quote worker still owns a separate Haynes profile. Do not point two running browsers at one profile or copy their cookie files. The new optional Haynes credentials apply to the primary vehicle/service worker only.
- Supplier MFA, CAPTCHA, password changes, account limits and catalogue ambiguity can still need an operator.
- The PC must remain awake, signed in and online. A worker update cannot repair a PC power or internet outage.
- The latest meaningful sample before this work, 7 November 08:30 UK, showed current Haynes and GSF contacts with no active overdue jobs or new jobs since the baseline. ESP's known last contact remained 5 November 10:31. This was a sample, not a continuous uptime measurement.

## Direct supplier connections

Reviewed official documentation on 7 November 2026:

| Supplier | Evidence | Required next step |
| --- | --- | --- |
| ESP / Virtual Warehouse | [MIDaS API](https://api.thevirtualwarehouse.co.uk/Help) documents token authentication and ProductSearch by tyre dimensions. Login requires an active API key. | Ask ESP/CAM whether Vecta can use an approved API key for live trade prices, local and remote warehouse availability, and delivery options. Confirm request limits and commercial terms. |
| HaynesPro | [Data delivery methods](https://www.infopro-digital-automotive.com/uk/haynespro-data/) describe portal single sign-on and web services for maintenance and repair data. | Confirm licence, customer-facing usage, vehicle identification, oil data, repair times, concurrency and caching rights. Obtain a sandbox before building an adapter. |
| GSF | [GSF's integration announcement](https://gsfgroup.com/03-08-22-gsf-car-parts-announces-garage-hive-integration/) establishes a supported integration with Garage Hive. It does not establish a public API or Vecta's entitlement. | Ask GSF's integration team about an approved connection for service parts, oil, repair parts, Vecta trade prices and availability. No ordering capability is needed. |

No supplier was contacted, no API access was purchased and no undocumented internal endpoints were used. Replace one supplier at a time behind the existing result validation, comparing live results before switching. Keep the current browser fallback until the direct connection is proven.

## Verification

The GSF completion and cleanup failure cases were reproduced with isolated fake browser/RPC adapters. SQL busy/offline/cache/deadline cases use private temporary tables and rollback. The Haynes login fixture was reduced from the public login form without account data; it checks successful login, rejected credentials, concurrency, cooldown, origin/form changes and human-verification refusal. The installer was rehearsed on a copy of the known managed installation, including repeat installation, refusal of unknown code, catalogue preservation and rollback.
