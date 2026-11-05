-- Recheck an earlier email against the exact saved appointment. The service
-- endpoint has re-fetched and authenticated the original email. Lock before
-- checking the job so a concurrent edit cannot confirm a different booking.
create or replace function public.vecta_recheck_mot_confirmation(p_job_id uuid,p_record jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 j public.jobs%rowtype; saved jsonb; result jsonb; appointment text;
begin
 perform set_config('lock_timeout','5s',true);
 lock table public.jobs in share row exclusive mode;
 select * into j from public.jobs where id=p_job_id;
 select value into saved from public.workshop_settings where id='mot-email:'||(p_record->>'email_id') for update;
 if saved->>'allocation_status'='allocated' then
  if saved->>'job_id'=p_job_id::text then return saved; end if;
  return null;
 end if;
 if saved is null or coalesce(saved->>'allocation_status','') not in ('no_unallocated_mot','multiple_unallocated_mots')
  or p_record->>'state' is distinct from 'confirmed'
  or saved->>'reference' is distinct from p_record->>'reference'
  or saved->>'registration' is distinct from p_record->>'registration'
  or saved->>'date' is distinct from p_record->>'date'
  or saved->>'time' is distinct from p_record->>'time'
  or (saved->>'received_at')::timestamptz is distinct from (p_record->>'received_at')::timestamptz then return null; end if;
 appointment:=substring(coalesce(j.customer_note,'') from '\[\[MOT_TIME:([^]]+)\]\]');
 if appointment is null and lower(trim(coalesce(j.technician,'')))='chris' then appointment:=to_char(j.drop_time,'HH24:MI'); end if;
 if j.id is null or coalesce(j.archived,false) or j.status is distinct from 'booked' or coalesce(j.card_type,'job')<>'job'
  or coalesce(j.job_type,'') !~* '(^|\|\||,|;)\s*mot( test)?\s*($|\|\||,|;)'
  or regexp_replace(upper(coalesce(j.registration,'')),'[^A-Z0-9]','','g') is distinct from p_record->>'registration'
  or j.booking_date::text is distinct from p_record->>'date'
  or appointment is distinct from p_record->>'time' then return null; end if;
 -- The existing function retains cancellation, duplicate, past-date, clash,
 -- time-off and service-slot safeguards. It also preserves forwarding state.
 result:=public.vecta_apply_mot_confirmation(p_record);
 if result->>'allocation_status'='allocated' and result->>'job_id' is distinct from p_job_id::text then
  raise exception 'MOT recheck selected a different job';
 end if;
 return result;
end;$$;
revoke all on function public.vecta_recheck_mot_confirmation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_recheck_mot_confirmation(uuid,jsonb) to service_role;
