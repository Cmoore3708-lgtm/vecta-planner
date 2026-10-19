// The supplier-specific selectors are configured only after inspecting a live account.
export const SUPPLIER = 'https://esp.thevirtualwarehouse.co.uk/';
export async function searchSupplier(page, size, adapter) {
  const { parseSize } = await import('./guide.mjs');
  const parsed = parseSize(size);
  await page.goto(SUPPLIER, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (/\/Account\/LogOn/i.test(page.url())) throw new Error('SUPPLIER_LOGIN_REQUIRED');
  for (const field of ['width', 'profile', 'rim']) {
    const input = page.locator(adapter[field]);
    if (await input.count() !== 1) throw new Error(`Supplier ${field} control changed`);
    await input.fill(String(parsed[field]));
  }
  // Adapter may only target the Search control, never Cart or Order controls.
  const search = page.locator(adapter.search);
  if (await search.count() !== 1 || !/^search$/i.test((await search.innerText()).trim())) throw new Error('Supplier Search control not verified');
  await search.click();
  await page.locator(adapter.resultReady).waitFor({ timeout: 20000 });
  return adapter.readRows(page, parsed);
}
