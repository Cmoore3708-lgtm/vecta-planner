// Shared with the PC worker. Money is integer pence; quantities are thousandths.
export const SERVICES = ['Oil & Filter Change', 'Full Service', 'Major Service'];
export const normaliseRegistration = value => String(value || '').toUpperCase().replace(/\s/g, '');
const fail = reason => { throw Error(reason); };
const boundedText = (value, max = 160) => typeof value === 'string' && value.trim() && value.length <= max && !/[\r\n<>]/.test(value) ? value.trim() : fail('INVALID_RESULT');
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max ? value : fail('INVALID_RESULT');

export function servicePriceRequest(raw) {
  const registration = normaliseRegistration(raw?.registration);
  if (!/^[A-Z0-9]{5,8}$/.test(registration) || !SERVICES.includes(raw?.service)) fail('INVALID_REQUEST');
  const mileage = raw.mileage === null || raw.mileage === '' || raw.mileage === undefined ? null : raw.mileage;
  if (mileage !== null && (!Number.isSafeInteger(mileage) || mileage < 0 || mileage > 2000000)) fail('INVALID_REQUEST');
  const range = raw.range || 'Mid Range';
  if (!['Budget', 'Mid Range', 'Premium/Dealer'].includes(range)) fail('INVALID_REQUEST');
  return {registration, service:raw.service, mileage, range};
}
export const servicePriceKey = raw => JSON.stringify(servicePriceRequest(raw));

export function pricingPolicy(raw) {
  if (!raw || typeof raw.version !== 'string' || !/^[a-zA-Z0-9.-]{1,40}$/.test(raw.version)) fail('SETTINGS_REQUIRED');
  const markupBps = integer(raw.markupBps, 0, 30000);
  const vatBps = integer(raw.vatBps, 0, 3000);
  const roundUpPence = integer(raw.roundUpPence, 1, 1000);
  const labour = Object.fromEntries(SERVICES.map(name => [name, integer(raw.labourNetPence?.[name], 1, 200000)]));
  return {version:raw.version, markupBps, vatBps, roundUpPence, labourNetPence:labour};
}

export function cleanServiceCosts(raw, request, now = Date.now()) {
  const input = servicePriceRequest(request);
  if (servicePriceKey(raw?.request) !== servicePriceKey(input)) fail('MISMATCH');
  const checked = Date.parse(raw.checkedAt);
  if (!Number.isFinite(checked) || checked < now - 300000 || checked > now + 60000) fail('EXPIRED_RESULT');
  if (raw.fitmentVerified !== true || raw.scopeVerified !== true || raw.oilVerified !== true) fail('REVIEW_REQUIRED');
  const recipeId = boundedText(raw.recipeId, 80), vehicle = boundedText(raw.vehicle);
  if (!Array.isArray(raw.items) || raw.items.length < 2 || raw.items.length > 16) fail('INCOMPLETE');
  const kinds = new Set(['oil', 'oil_filter', 'air_filter', 'cabin_filter', 'fuel_filter', 'spark_plug', 'sump_plug', 'washer']);
  const seen = new Set();
  const items = raw.items.map(row => {
    if (!kinds.has(row.kind) || seen.has(row.kind)) fail('INVALID_RESULT');
    seen.add(row.kind);
    if (row.vatBasis !== 'EX_VAT' || row.inStock !== true) fail('SETTINGS_REQUIRED');
    const quantityMilli = integer(row.quantityMilli, 1, 30000);
    if (row.kind !== 'oil' && quantityMilli % 1000 !== 0) fail('INVALID_RESULT');
    return {kind:row.kind, sku:boundedText(row.sku, 80), brand:boundedText(row.brand, 80),
      description:boundedText(row.description), unitNetPence:integer(row.unitNetPence, 1, 100000), quantityMilli,
      vatBasis:'EX_VAT', inStock:true};
  });
  const required = input.service === 'Oil & Filter Change' ? ['oil','oil_filter'] : ['oil','oil_filter','air_filter','cabin_filter'];
  if (required.some(kind => !seen.has(kind))) fail('INCOMPLETE');
  // Major extras are approved by vehicle recipe, never inferred from fuel alone.
  const requiredKinds = raw.requiredKinds;
  if (!Array.isArray(requiredKinds) || requiredKinds.length > 16 || new Set(requiredKinds).size !== requiredKinds.length ||
      requiredKinds.some(kind => !kinds.has(kind) || !seen.has(kind)) || items.some(row => !requiredKinds.includes(row.kind))) fail('INCOMPLETE');
  const oilSpecification = boundedText(raw.oilSpecification);
  return {request:input, recipeId, vehicle, oilSpecification, requiredKinds:[...requiredKinds], items,
    fitmentVerified:true, scopeVerified:true, oilVerified:true, checkedAt:new Date(checked).toISOString()};
}

export function calculateServicePrice(raw, request, policyInput, now = Date.now()) {
  const costs = cleanServiceCosts(raw, request, now), policy = pricingPolicy(policyInput);
  const lines = costs.items.map(item => {
    const costNetPence = Math.round(item.unitNetPence * item.quantityMilli / 1000);
    return {...item, costNetPence, sellNetPence:Math.round(costNetPence * (10000 + policy.markupBps) / 10000)};
  });
  const partsNetPence = lines.reduce((sum, row) => sum + row.sellNetPence, 0);
  const labourNetPence = policy.labourNetPence[costs.request.service];
  const baseNet = partsNetPence + labourNetPence;
  const baseGross = baseNet + Math.round(baseNet * policy.vatBps / 10000);
  const totalPence = Math.ceil(baseGross / policy.roundUpPence) * policy.roundUpPence;
  const netPence = Math.round(totalPence * 10000 / (10000 + policy.vatBps));
  return {...costs, lines, partsNetPence, labourNetPence, roundingNetPence:netPence - baseNet,
    netPence, vatPence:totalPence - netPence, totalPence, policyVersion:policy.version};
}

// Deliberately excludes purchase costs, markup and the supplier account.
export function publicServicePrice(price) {
  return {request:price.request, vehicle:price.vehicle, recipeId:price.recipeId,
    oilSpecification:price.oilSpecification, checkedAt:price.checkedAt, policyVersion:price.policyVersion,
    items:price.lines.map(({kind, sku, brand, description, quantityMilli}) => ({kind,sku,brand,description,quantityMilli})),
    netPence:price.netPence, vatPence:price.vatPence, totalPence:price.totalPence};
}
