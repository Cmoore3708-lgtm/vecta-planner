-- Called only by the signed-email handler with a service-role connection.
-- Serialize the admission check with ordinary planner writes as well as other
-- webhooks; no new tables or broad client privileges are introduced.
create or replace function public.vecta_apply_mot_confirmation(p_record jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v jsonb:=p_record; existing jsonb; j public.jobs%rowtype; candidates uuid[];
 target_date date; target_time time; start_min numeric; duration_min numeric;
 note text; reason text; event_key text; prior jsonb; off_item jsonb;
begin
 perform set_config('lock_timeout','5s',true);
 if coalesce(v->>'email_id','') !~* '^[a-f0-9-]{36}$' then raise exception 'Invalid email ID'; end if;
 event_key:='mot-email:'||(v->>'email_id');
 lock table public.jobs in share row exclusive mode;
 select value into existing from public.workshop_settings where id=event_key for update;
 if existing->>'allocation_status'='allocated' then return existing; end if;
 if existing->>'forwarded'='true' then v:=v||jsonb_build_object('forwarded',true,'forwarded_id',existing->>'forwarded_id'); end if;
 if v->>'state'='confirmed' then
  if coalesce(v->>'registration','') !~ '^[A-Z0-9]{2,10}$' or coalesce(v->>'reference','') !~ '^\d+$'
    or coalesce(v->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid confirmation'; end if;
  target_date:=(v->>'date')::date;target_time:=(v->>'time')::time;
  if target_date is null or v->>'received_at' is null then raise exception 'Missing appointment'; end if;
  if exists(select 1 from public.workshop_settings s where s.id like 'mot-email:%' and s.id<>event_key
    and s.value->>'reference'=v->>'reference'
    and (s.value->>'received_at')::timestamptz >= (v->>'received_at')::timestamptz) then
   reason:='superseded';
  else
   select array_agg(id) into candidates from public.jobs where
    regexp_replace(upper(coalesce(registration,'')),'[^A-Z0-9]','','g')=v->>'registration'
    and lower(trim(coalesce(technician,''))) in ('','unallocated')
    and not coalesce(archived,false) and coalesce(card_type,'job')='job' and status='booked'
    and coalesce(job_type,'') ~* '(^|\|\||,|;)\s*mot( test)?\s*($|\|\||,|;)';
   if coalesce(array_length(candidates,1),0)<>1 then
    reason:=case when coalesce(array_length(candidates,1),0)=0 then 'no_unallocated_mot' else 'multiple_unallocated_mots' end;
   else
    select * into j from public.jobs where id=candidates[1];
    start_min:=extract(epoch from target_time)/60;
    duration_min:=greatest(15,coalesce(nullif(j.estimated_hours,0),1)*60);
    if target_date < (now() at time zone 'Europe/London')::date then reason:='past_appointment';
    elsif start_min<480 or start_min+duration_min>1440 then reason:='outside_planner_hours';
    elsif exists(select 1 from public.jobs busy where busy.id<>j.id and busy.booking_date=target_date
      and lower(trim(busy.technician))='chris' and not coalesce(busy.archived,false)
      and lower(coalesce(busy.status,'')) not in ('cancelled','deleted','quote')
      and coalesce(busy.card_type,'job')<>'quote'
      and extract(epoch from coalesce(busy.drop_time,'08:00'::time))/60 < start_min+duration_min
      and extract(epoch from coalesce(busy.drop_time,'08:00'::time))/60+greatest(15,coalesce(nullif(busy.estimated_hours,0),1)*60)>start_min)
    then reason:='chris_time_clash';
    end if;
    for off_item in select value from jsonb_array_elements(coalesce((select value->'mechanicTimeOff' from public.workshop_settings where id='main'),'[]'::jsonb)) loop
     if lower(coalesce(off_item->>'mechanic',''))='chris'
       and target_date between (off_item->>'start_date')::date and (off_item->>'end_date')::date
       and (case when target_date=(off_item->>'start_date')::date then extract(epoch from coalesce(nullif(off_item->>'start_time','')::time,'08:00'::time))/60 else 0 end)<start_min+duration_min
       and (case when target_date=(off_item->>'end_date')::date then extract(epoch from coalesce(nullif(off_item->>'end_time','')::time,'23:59'::time))/60 else 1440 end)>start_min
     then reason:='chris_time_off'; end if;
    end loop;
    if reason is null then
     note:=trim(regexp_replace(coalesce(j.customer_note,''),'\[\[MOT_TIME:[^]]+\]\]','','gi'));
     note:=note||case when note='' then '' else E'\n' end||'[[MOT_TIME:'||(v->>'time')||']]';
     update public.jobs set booking_date=target_date,drop_time=target_time,technician='Chris',customer_note=note,updated_at=now() where id=j.id;
     v:=v||jsonb_build_object('allocation_status','allocated','job_id',j.id,'allocated_at',now(),'previous_booking_date',j.booking_date,'previous_drop_time',j.drop_time);
    end if;
   end if;
  end if;
 else reason:='confirmation_needs_review';
 end if;
 if reason is not null then v:=v||jsonb_build_object('state','review','allocation_status',reason); end if;
 insert into public.workshop_settings(id,value,updated_at) values(event_key,v,now())
  on conflict(id) do update set value=excluded.value,updated_at=excluded.updated_at;
 return v;
end;$$;
revoke all on function public.vecta_apply_mot_confirmation(jsonb) from public,anon,authenticated;
grant execute on function public.vecta_apply_mot_confirmation(jsonb) to service_role;
