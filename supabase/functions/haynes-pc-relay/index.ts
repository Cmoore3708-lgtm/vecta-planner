import { vehicleResult, normaliseReg, validReg } from '../../../lib/haynes-vehicle.js';

const TEST = 'https://brqsejjykrubxuofavuu.supabase.co';
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2,'0')).join('');
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: {'Content-Type':'application/json','Cache-Control':'no-store'} });
// Custom authentication: one-use expiring pairing code, then a scoped worker token.
// No CORS and no service credentials leave the function.
Deno.serve(async req => {
  if (req.method !== 'POST') return response({status:'METHOD_NOT_ALLOWED'},405);
  if (Deno.env.get('SUPABASE_URL') !== TEST) return response({status:'DISABLED'},404);
  try {
    const reader = req.body?.getReader();
    if (!reader) return response({status:'INVALID_REQUEST'},400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) { await reader.cancel(); return response({status:'INVALID_REQUEST'},413); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    const input = new TextDecoder().decode(bytes);
    const body = JSON.parse(input);
    if (!['pair','pull','complete'].includes(body.action)) return response({status:'INVALID_ACTION'},400);
    let payload: Record<string,unknown>;
    if (body.action === 'pair') {
      if (!/^[a-f0-9]{32}$/.test(body.code) || !/^[a-f0-9]{64}$/.test(body.token)) return response({status:'UNAUTHORIZED'},401);
      payload = { pair_hash: await hash(body.code), token_hash: await hash(body.token) };
    } else {
      const token = (req.headers.get('authorization') || '').replace(/^Bearer /,'');
      if (!/^[a-f0-9]{64}$/.test(token)) return response({status:'UNAUTHORIZED'},401);
      payload = { token_hash: await hash(token) };
      if (body.action === 'complete') {
        if (!/^[a-f0-9-]{36}$/.test(body.id) || !/^[a-f0-9-]{36}$/.test(body.lease)) return response({status:'INVALID_RESULT'},400);
        payload.id = body.id; payload.lease = body.lease; payload.status = body.status;
        if (body.status === 'MATCHED') {
          const reg = normaliseReg(body.vehicle?.registration);
          if (!validReg(reg)) return response({status:'INVALID_RESULT'},400);
          payload.vehicle = vehicleResult(body.vehicle,reg);
        }
      }
    }
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const result = await fetch(TEST + '/rest/v1/rpc/haynes_relay', {method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:body.action,p_payload:payload}),signal:AbortSignal.timeout(8000)});
    if (!result.ok) return response({status:'UNAVAILABLE'},503);
    const data = await result.json();
    return response(data,data.status === 'UNAUTHORIZED' ? 401 : 200);
  } catch { return response({status:'UNAVAILABLE'},503); }
});
