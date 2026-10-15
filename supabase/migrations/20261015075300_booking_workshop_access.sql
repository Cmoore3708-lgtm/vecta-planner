-- A newly provisioned Test table must expose the same workshop-only access as
-- core tables. The production anon cutover remains in the earlier access migration.
grant select,insert,update,delete on public.website_booking_requests to authenticated;
do $$begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='website_booking_requests' and policyname='workshop_booking_access') then
 execute $policy$create policy workshop_booking_access on public.website_booking_requests for all to authenticated
 using ((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'vecta_access')='workshop')
 with check ((select auth.uid()) is not null and (select auth.jwt()->'app_metadata'->>'vecta_access')='workshop')$policy$;
 end if;
end;$$;
