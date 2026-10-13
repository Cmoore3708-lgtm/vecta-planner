-- Durable failed-registration memory. Apply instead of the earlier timed pause.
-- Public booking callers cannot bypass it; the site passes retry only after manager auth.
ALTER TABLE public.haynes_relay_jobs ADD COLUMN IF NOT EXISTS retry_requested boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.haynes_relay_failed_registrations (
  registration text PRIMARY KEY CHECK (registration ~ '^[A-Z0-9]{2,8}$'),
  status text NOT NULL CHECK (status IN ('UNAVAILABLE','AMBIGUOUS')),
  failed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.haynes_relay_failed_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haynes_relay_failed_registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.haynes_relay_failed_registrations TO service_role;
CREATE OR REPLACE FUNCTION public.haynes_remember_failed_registration() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  -- Only a completed worker result counts. Queue expiry/offline/login are not a vehicle match failure.
  IF NEW.completed_at IS NOT NULL AND NEW.status IN ('UNAVAILABLE','AMBIGUOUS') THEN
    INSERT INTO public.haynes_relay_failed_registrations(registration,status,failed_at)
    VALUES (NEW.registration,NEW.status,NEW.completed_at)
    ON CONFLICT (registration) DO UPDATE SET status=excluded.status,failed_at=excluded.failed_at;
  ELSIF NEW.status='MATCHED' AND NEW.completed_at IS NOT NULL THEN
    DELETE FROM public.haynes_relay_failed_registrations WHERE registration=NEW.registration;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.haynes_remember_failed_registration() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS haynes_remember_failed_registration ON public.haynes_relay_jobs;
CREATE TRIGGER haynes_remember_failed_registration AFTER INSERT OR UPDATE ON public.haynes_relay_jobs
FOR EACH ROW EXECUTE FUNCTION public.haynes_remember_failed_registration();
-- Remember recent unresolved failures (including KX15 FWF); never override a later successful match.
INSERT INTO public.haynes_relay_failed_registrations(registration,status,failed_at)
SELECT registration,status,completed_at FROM (
  SELECT DISTINCT ON (registration) registration,status,completed_at
  FROM public.haynes_relay_jobs WHERE completed_at IS NOT NULL
  ORDER BY registration,completed_at DESC
) latest WHERE status IN ('UNAVAILABLE','AMBIGUOUS')
ON CONFLICT (registration) DO NOTHING;
DO $migration$
DECLARE definition text; anchor text;
BEGIN
  definition := pg_get_functiondef('public.haynes_relay(text,jsonb)'::regprocedure);
  IF position('-- Durable failed-registration memory.' in definition)>0 THEN RETURN; END IF;
  anchor := '    select * into j from public.haynes_relay_jobs where registration = reg and status = ''MATCHED''';
  IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Expected relay enqueue cache missing'; END IF;
  definition := replace(definition,anchor,
    '    -- Durable failed-registration memory.
    if p_payload->>''retry'' = ''true'' then
      delete from public.haynes_relay_failed_registrations where registration=reg;
    elsif exists(select 1 from public.haynes_relay_failed_registrations where registration=reg) then
      return jsonb_build_object(''status'',''UNAVAILABLE'',''lookupPaused'',true);
    end if;
' || anchor);
  anchor := 'and status in (''UNAVAILABLE'',''AMBIGUOUS'')';
  IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Expected relay negative cache missing'; END IF;
  definition := replace(definition,anchor,anchor || ' and coalesce(p_payload->>''retry'',''false'') <> ''true''');
  anchor := 'insert into public.haynes_relay_jobs(registration) values (reg)';
  IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Expected relay insert missing'; END IF;
  definition := replace(definition,anchor,'insert into public.haynes_relay_jobs(registration,retry_requested) values (reg,coalesce(p_payload->>''retry'',''false'')=''true'')');
  anchor := '''registration'',j.registration,''lease'',j.lease';
  IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'Expected relay claim missing'; END IF;
  definition := replace(definition,anchor,anchor || ',''retry'',j.retry_requested');
  EXECUTE definition;
END $migration$;
