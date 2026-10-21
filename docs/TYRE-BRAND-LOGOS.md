# Tyre brand artwork

Original manufacturer artwork obtained from the Tyre Reviews brand directory on 21 October 2026: https://www.tyrereviews.com/Tyre/ . Local PNG copies retain the original proportions and colours. Brand names and logos belong to their respective owners.

The explicit allowlist in `public/js/vecta-tyre-booking.js` prevents supplier text from becoming an image path or HTML. Brands outside this collection retain their readable name. Failed images hide their logo panel; the name remains visible. No remote image dependency is used at runtime.

Add verified PNG artwork under `public/assets/tyre-brands`, extend the allowlist, then run `npm run sync:booking`.
