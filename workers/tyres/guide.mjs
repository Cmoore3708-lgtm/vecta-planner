export function parseSize(value) {
  const match = String(value ?? '').trim().match(/^(\d{3})\s*[/ ]\s*(\d{2})\s*(?:R|[/ ])\s*(\d{2})$/i);
  if (!match) throw new Error('Enter a tyre size such as 205/55 R16');
  const [width, profile, rim] = match.slice(1).map(Number);
  if (width < 125 || width > 355 || width % 5 || profile < 20 || profile > 85 || profile % 5 || rim < 10 || rim > 24) throw new Error('Unsupported tyre size');
  return { width, profile, rim, key: `${width}/${profile}R${rim}` };
}
export function moneyPence(value) {
  const match = String(value ?? '').trim().match(/^£?\s*(\d+(?:,\d{3})*)(?:\.(\d{2}))?$/);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(',', '')) * 100 + Number(match[2] || 0);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
export function selectGuides(rows, { size, quantity = 1, brands, settings, now = Date.now() }) {
  const requested = parseSize(size);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) throw new Error('Choose between 1 and 4 tyres');
  if (settings?.vatIncluded !== true || settings?.fullyFitted !== true) throw new Error('Fully fitted VAT-inclusive Sellout settings must be verified');
  const categories = ['budget', 'midrange', 'premium'];
  const classification = new Map();
  for (const category of categories) for (const brand of brands?.[category] || []) {
    const key = brand.trim().toUpperCase();
    if (classification.has(key)) throw new Error('Brand assigned to more than one category');
    classification.set(key, category);
  }
  const eligible = rows.flatMap(row => {
    let actual;
    try { actual = parseSize(row.size); } catch { return []; }
    const price = moneyPence(row.sellout);
    const category = classification.get(String(row.brand).trim().toUpperCase());
    if (actual.key !== requested.key || !price || !category || !Number.isFinite(row.stock) || row.stock < quantity) return [];
    // Explicitly avoid special constructions being selected as a general guide.
    if (row.runflat !== false || row.season !== 'summer' || row.newTyre !== true) return [];
    return [{ category, brand: row.brand, model: row.model, price }];
  });
  return {
    size: requested.key, quantity, checkedAt: new Date(now).toISOString(), guideOnly: true,
    options: categories.map(category => {
      const tyre = eligible.filter(row => row.category === category).sort((a, b) => a.price - b.price)[0];
      return tyre ? { category, available: true, brand: tyre.brand, model: tyre.model, unitPence: tyre.price, totalPence: tyre.price * quantity } : { category, available: false };
    })
  };
}
