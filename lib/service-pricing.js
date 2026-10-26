// Shared with the PC worker. Money is integer pence; quantities are thousandths.
export const COMPARISON_SERVICES = ['Oil & Filter Change', 'Full Service', 'Major Service'];
export const SERVICES = [...COMPARISON_SERVICES,'Interim Service','EV Major Service'];
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

// VECTA default service packages, independent of mileage/OEM due-item schedules.
// Mirrors the saved default parts lists; plugs are always a separate discussion.
export function serviceRequiredKinds(service,fuelType) {
  if(!SERVICES.includes(service))fail('INVALID_REQUEST');
  if(service==='EV Major Service')return ['air_filter','cabin_filter'];
  const required=['oil','oil_filter'];
  if(!['Oil & Filter Change','Interim Service'].includes(service))required.push('air_filter','cabin_filter');
  if(service==='Major Service') {
    const fuel=String(fuelType||'').trim().toLowerCase();
    if(!['petrol','diesel','petrol hybrid','diesel hybrid'].includes(fuel))fail('REVIEW_REQUIRED');
    if(fuel==='diesel'||fuel==='diesel hybrid')required.push('fuel_filter');
  }
  return required;
}

export function pricingPolicy(raw) {
  if (!raw || typeof raw.version !== 'string' || !/^[a-zA-Z0-9.-]{1,40}$/.test(raw.version)) fail('SETTINGS_REQUIRED');
  const markupBps = integer(raw.markupBps, 0, 30000);
  const vatBps = integer(raw.vatBps, 0, 3000);
  const roundUpPence = integer(raw.roundUpPence, 1, 1000);
  const labour = Object.fromEntries(COMPARISON_SERVICES.map(name => [name, integer(raw.labourNetPence?.[name], 1, 200000)]));
  labour['Interim Service']=raw.labourNetPence?.['Interim Service']===undefined?labour['Oil & Filter Change']:integer(raw.labourNetPence['Interim Service'],1,200000);
  // The saved EV package total is not evidence of its net labour component.
  if(raw.labourNetPence?.['EV Major Service']!==undefined)labour['EV Major Service']=integer(raw.labourNetPence['EV Major Service'],1,200000);
  return {version:raw.version, markupBps, vatBps, roundUpPence, labourNetPence:labour};
}

export function cleanServiceCosts(raw, request, now = Date.now()) {
  const input = servicePriceRequest(request);
  if (servicePriceKey(raw?.request) !== servicePriceKey(input)) fail('MISMATCH');
  const checked = Date.parse(raw.checkedAt);
  if (!Number.isFinite(checked) || checked < now - 300000 || checked > now + 60000) fail('EXPIRED_RESULT');
  const oilApplicable=input.service!=='EV Major Service';
  if(!oilApplicable&&!['electric','electricity','battery electric','bev'].includes(String(raw.fuelType||'').trim().toLowerCase()))fail('REVIEW_REQUIRED');
  if (raw.fitmentVerified !== true || raw.scopeVerified !== true || (oilApplicable&&raw.oilVerified !== true)) fail('REVIEW_REQUIRED');
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
    const unitNetPence=integer(row.unitNetPence, 1, 100000);
    let pack={};
    if(row.packNetPence!==undefined || row.packQuantityMilli!==undefined) {
      if(row.kind!=='oil')fail('INVALID_RESULT');
      const packNetPence=integer(row.packNetPence,1,500000);
      const packQuantityMilli=integer(row.packQuantityMilli,1,250000);
      if(unitNetPence!==Math.ceil(packNetPence*1000/packQuantityMilli))fail('INVALID_RESULT');
      pack={packNetPence,packQuantityMilli};
    }
    return {kind:row.kind, sku:boundedText(row.sku, 80), brand:boundedText(row.brand, 80),
      description:boundedText(row.description), unitNetPence, quantityMilli, ...pack,
      vatBasis:'EX_VAT', inStock:true};
  });
  const required = serviceRequiredKinds(input.service,raw.fuelType);
  if (required.some(kind => !seen.has(kind))) fail('INCOMPLETE');
  if(items.some(row=>!required.includes(row.kind)&&(!oilApplicable||!['sump_plug','washer'].includes(row.kind))))fail('REVIEW_REQUIRED');
  // Fitment and oil remain vehicle-specific; scope follows VECTA's default list.
  const requiredKinds = raw.requiredKinds;
  if (!Array.isArray(requiredKinds) || requiredKinds.length > 16 || new Set(requiredKinds).size !== requiredKinds.length ||
      requiredKinds.some(kind => !kinds.has(kind) || !seen.has(kind)) || items.some(row => !requiredKinds.includes(row.kind))) fail('INCOMPLETE');
  const oilSpecification = oilApplicable?boundedText(raw.oilSpecification):'';
  return {request:input, recipeId, vehicle, oilSpecification, fuelType:String(raw.fuelType||'').trim().toLowerCase(), requiredKinds:[...requiredKinds], items,
    fitmentVerified:true, scopeVerified:true, oilVerified:oilApplicable, checkedAt:new Date(checked).toISOString()};
}

export function calculateServicePrice(raw, request, policyInput, now = Date.now()) {
  const costs = cleanServiceCosts(raw, request, now), policy = pricingPolicy(policyInput);
  const lines = costs.items.map(item => {
    const chargedQuantityMilli=item.kind==='oil'?Math.ceil(item.quantityMilli/1000)*1000:item.quantityMilli;
    // Keep the original oil-pack fraction until the actual fill cost is rounded.
    const costNetPence = item.packNetPence===undefined
      ? Math.round(item.unitNetPence * chargedQuantityMilli / 1000)
      : Math.round(item.packNetPence * chargedQuantityMilli / item.packQuantityMilli);
    return {...item, chargedQuantityMilli, costNetPence, sellNetPence:Math.round(costNetPence * (10000 + policy.markupBps) / 10000)};
  });
  const partsNetPence = lines.reduce((sum, row) => sum + row.sellNetPence, 0);
  const labourNetPence = policy.labourNetPence[costs.request.service];
  if(!Number.isSafeInteger(labourNetPence))fail('SETTINGS_REQUIRED');
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
    items:price.lines.map(({kind, sku, brand, description, quantityMilli, chargedQuantityMilli}) =>
      ({kind,sku,brand,description,quantityMilli,...(kind==='oil'?{chargedQuantityMilli}: {})})),
    netPence:price.netPence, vatPence:price.vatPence, totalPence:price.totalPence};
}
