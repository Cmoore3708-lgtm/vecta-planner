# Vehicle image reliability

Image choice is visual and deliberately does not require an exact engine/trim.
Chris requested on 3 November 2026 that a Mazda 6 model drawing, for example,
should remain usable when the precise trim cannot be matched. This applies to
all manufacturers. Technical Haynes identification and pricing stay separate.

Website order:

1. A compatible image already remembered by this browser can paint immediately.
2. Read the requested registration's saved artwork, identity and colour together.
   Preserve manually selected artwork. Prefer an exact identity over generic art.
3. If none fits, use a drawing of the same make/model from the shared catalogue.
   The catalogue is read once per minute per server instance, only on a miss.
   It reads artwork/identity settings, never jobs or contact information, and the
   public response contains only the requested registration and visual fields.
4. Run Haynes identification alongside this visual lookup. A login/variant failure
   cannot remove a usable drawing. A successful exact match can improve the art.

A donor drawing never supplies its plate, colour, engine, type ID or service
schedule. Current government colour wins over an older automatic colour; a manual
artwork colour remains authoritative. The shared renderer applies the requested
colour and plate and ignores stale asynchronous results after inputs change.

Make aliases, manufacturer prefixes, model-code spacing, supplier generation
suffixes and common BMW/Mercedes naming differences are normalised for images.
Numbers still distinguish different models, such as Mazda 3/6 and NV200/NV400.
Workshop generic image selection also strips the manufacturer before comparing
numeric model names. No dashboard layout baseline changed.

Generic shared art can be upgraded by a verified exact match; authenticated retry
can replace automatic artwork. Conditional writes protect concurrent manual
edits. Later government colour lookups can correct the shared automatic colour.

The catalogue has a bounded 1,000-record read. This improves availability for
models already known to VECTA; it cannot manufacture a missing supplier drawing.
No secondary paid image supplier or workshop PC update is introduced.

Tests cover trim variations across 13 manufacturer/model examples, offline PC
fallback, shared catalogue reuse, wrong-model rejection, donor data isolation,
manual choice priority, cache reopening, inherited body fill and rendering races.
Live visual verification and the repository release process remain required
before production release.
