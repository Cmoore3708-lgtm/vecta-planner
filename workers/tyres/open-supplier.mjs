// Do not wait for slow third-party assets after ESP's document is ready.
// Enquiry and pricing settings are still verified by the caller.
export async function openTyreSupplier(page, supplier) {
  const options = { waitUntil:'domcontentloaded', timeout:20000 };
  try {
    await page.goto(supplier, options);
  } catch (error) {
    if (error.name !== 'TimeoutError' || page.isClosed()) throw error;
    // A genuine navigation timeout gets one more attempt on the same tab.
    // Continued outages fall back to the managed worker's existing backoff.
    await page.goto(supplier, options);
  }
}
