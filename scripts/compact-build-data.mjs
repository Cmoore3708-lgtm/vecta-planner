// Build-only encoding. Readable source records remain the authority.
const DATA_NAMES = ['window.INITIAL_FLEET_VEHICLES', 'window.CONTRACTOR_2026_JOBS',
  'window.CONTRACTOR_2026_NEW_VEHICLES', 'window.NMUK_2026_JOBS', 'HISTORICAL_COMPLETION_SEED'];

export function encodeRecords(records) {
  if (!Array.isArray(records) || !records.length || records.some(row =>
    !row || typeof row !== 'object' || Array.isArray(row))) return JSON.stringify(records);
  const schemas = [], indexes = new Map();
  const rows = records.map(record => {
    const keys = Object.keys(record), signature = JSON.stringify(keys);
    if (!indexes.has(signature)) { indexes.set(signature, schemas.length); schemas.push(keys); }
    return [indexes.get(signature), ...keys.map(key => record[key])];
  });
  // Each record retains its own key order, absent fields and explicit nulls.
  // Decoding is synchronous at the original assignment, before any consumer runs.
  const encoded = `((schemas,rows)=>rows.map(row=>Object.fromEntries(schemas[row[0]].map((key,i)=>[key,row[i+1]]))))(${JSON.stringify(schemas)},${JSON.stringify(rows)})`;
  return encoded.length < JSON.stringify(records).length ? encoded : JSON.stringify(records);
}

export function compactBuildData(source) {
  for (const name of DATA_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^[ \\t]*(?:var )?${escaped}\\s*=\\s*)(\\[[^\\r\\n]*\\])([ \\t]*;?[ \\t]*$)`, 'gm');
    source = source.replace(pattern, (whole, prefix, json, suffix) => {
      // Only literal JSON seed assignments qualify; executable expressions do not.
      let rows;
      try { rows = JSON.parse(json); } catch { return whole; }
      return prefix + encodeRecords(rows) + suffix;
    });
  }
  return source;
}
