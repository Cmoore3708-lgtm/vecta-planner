// Read only the visible vehicle overview. No internal supplier endpoints.
export function readVehicle() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const text = document.body.innerText || document.body.textContent || '';
  const anchors = Array.from(document.querySelectorAll('a'));
  const link = part => anchors.find(a => a.href.includes('/' + part + '?'));
  const make = clean(link('makesOverview')?.textContent);
  const model = clean(link('modelOverview')?.textContent);
  const engine = clean(link('modelTypes')?.textContent);
  const years = engine.match(/\b(\d{4})\s*-\s*(\d{4})?\s*$/)?.[0] || '';
  const code = engine.match(/\(([^()]+)\)/)?.[1] || '';
  const variant = engine.replace(/\([^()]+\)/g, '').replace(/\b\d{4}\s*-\s*\d{0,4}\s*$/, '').trim();
  const image = Array.from(document.images).find(i => i.src.startsWith('https://www.haynespro-assets.com/workshop/images/'));
  return {
    login: !!document.querySelector('input[type="password"]'),
    blocked: /Verify you are human|Checking your browser|unusual traffic|automated traffic/i.test(text),
    // A multi-result selection page must never silently select the first result.
    ambiguous: !location.pathname.endsWith('/modelDetail') && anchors.some(a => a.href.includes('/modelDetail?')),
    registration: clean(text.match(/Vehicle Registration Number:\s*([A-Z0-9 ]+?)(?=\s*(?:VIN:|Registration Date:|[\n\r]|$))/)?.[1]).replace(/\s/g, ''),
    typeId: new URL(location.href).searchParams.get('typeId'),
    make, model, variant, engineCode: code, modelYears: years, imageUrl: image?.src || ''
  };
}
