-- Raise the integration resource guard, without resetting usage or changing grants.
-- Keep the existing function body and reject an unexpected deployed definition.
DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.haynes_relay(text,jsonb)'::regprocedure);
  IF position('w.quota_count >= 150' in definition) = 0 THEN
    RAISE EXCEPTION 'Expected relay quota guard missing';
  END IF;
  definition := replace(definition, 'w.quota_count >= 150', 'w.quota_count >= 500');
  IF position('if found then return jsonb_build_object(''status'',''MATCHED'',''vehicle'',j.vehicle); end if;' in definition) = 0 THEN
    RAISE EXCEPTION 'Expected cache return missing';
  END IF;
  definition := replace(definition,
    'if found then return jsonb_build_object(''status'',''MATCHED'',''vehicle'',j.vehicle); end if;',
    'if found then return jsonb_build_object(''status'',''MATCHED'',''vehicle'',j.vehicle); end if;
    -- Failed requests share a five-minute cooldown across all devices.
    select * into j from public.haynes_relay_jobs where registration = reg
      and status in (''UNAVAILABLE'',''AMBIGUOUS'')
      and greatest(created_at, completed_at) > now() - interval ''5 minutes''
      order by created_at desc limit 1;
    if found then return jsonb_build_object(''status'',j.status); end if;');
  EXECUTE definition;
END $migration$;
