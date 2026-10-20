-- One calendar for every work type; enforce 48 elapsed hours before 08:00 UK drop-off.
-- Availability and booking admission both call this function.
create or replace function public.vecta_booking_earliest(p_types jsonb,p_now timestamptz default now())
returns date language plpgsql immutable security invoker set search_path='' as $$
declare d date:=(p_now at time zone 'Europe/London')::date;
 minimum_notice timestamptz:=p_now+interval '48 hours';
begin
 if exists(select 1 from jsonb_array_elements_text(p_types) x where x ~* '^mot$') then
  d:=d+9;
 else
  d:=(minimum_notice at time zone 'Europe/London')::date;
  if (d+time '08:00') at time zone 'Europe/London' < minimum_notice then d:=d+1;end if;
 end if;
 while extract(isodow from d) not in (2,3,4,5) loop d:=d+1;end loop;
 return d;
end;$$;
revoke all on function public.vecta_booking_earliest(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.vecta_booking_earliest(jsonb,timestamptz) to service_role;
