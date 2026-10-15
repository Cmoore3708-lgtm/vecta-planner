-- Deploy authenticated workshop clients and verify the session exchange first.
-- Public bookings/customer links continue through service-side API handlers.
-- No business rows, financial values, or supplier relay policies are modified.
do $$
declare
  item text;
  policy_row record;
  workshop_tables text[] := array['jobs','tasks','notes','customers','vehicles',
    'service_reminders','workshop_settings','invoices','invoice_lines',
    'mot_history','service_records','website_booking_requests'];
begin
  foreach item in array workshop_tables loop
    if to_regclass(format('public.%I',item)) is null then
      raise exception 'Required workshop table is missing: %',item;
    end if;
    execute format('alter table public.%I enable row level security',item);
    -- Permissive policies combine with OR: leaving any legacy true policy would
    -- silently undo the protection supplied by the new authenticated policy.
    for policy_row in select policyname from pg_policies
      where schemaname='public' and tablename=item loop
      execute format('drop policy %I on public.%I',policy_row.policyname,item);
    end loop;
    execute format('revoke all on public.%I from anon',item);
    execute format('grant select,insert,update,delete on public.%I to authenticated',item);
    execute format('grant all on public.%I to service_role',item);
    execute format($policy$create policy "authorised workshop session" on public.%I
      for all to authenticated
      using ((select auth.uid()) is not null and
        (select auth.jwt())->'app_metadata'->>'vecta_access' = 'workshop')
      with check ((select auth.uid()) is not null and
        (select auth.jwt())->'app_metadata'->>'vecta_access' = 'workshop')$policy$,item);
  end loop;
  -- These tables are server-only; a public key never needs their table grants.
  foreach item in array array['invoice_customer_links','nmuk_service_reminder_sends',
    'website_content','website_content_history','workshop_push_subscriptions'] loop
    if to_regclass(format('public.%I',item)) is not null then
      execute format('revoke all on public.%I from anon, authenticated',item);
      execute format('grant all on public.%I to service_role',item);
    end if;
  end loop;
end $$;
-- The existing trigger needs no privileges beyond those of the authorised caller.
alter function public.set_updated_at() set search_path = '';
