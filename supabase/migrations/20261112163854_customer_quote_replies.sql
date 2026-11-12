-- Keep existing history. New decisions reach mechanics only when the office forwards them.
create or replace function public.vecta_portal_approval_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; k text;
begin
 if new.progress_review_state<>'sent' or new.progress_message is null then return new;end if;
 if tg_op='UPDATE' and old.progress_review_state='sent' and old.status is not distinct from new.status then return new;end if;
 select * into j from public.jobs where id=new.job_id;
 if j.id is null then return new;end if;
 k:=case when new.status in ('approved','declined') then 'approval_response' else 'approval_request' end;
 insert into public.customer_portal_events(job_id,registration,customer_email,kind,actor,message,details,created_at,manager_alert,mechanic_at,dedupe_key)
 values(j.id,regexp_replace(upper(new.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(new.customer_email,''))),k,
  case when k='approval_response' then 'customer' else 'workshop' end,new.progress_message,
  jsonb_build_object('approval_id',new.id,'status',new.status,'estimated_pence',new.progress_estimate_pence),
  case when k='approval_response' then coalesce(new.decided_at,clock_timestamp()) else clock_timestamp() end,
  k='approval_response',null,
  'approval:'||new.id::text||':'||new.status) on conflict(dedupe_key) do nothing;
 return new;
end;$$;
revoke all on function public.vecta_portal_approval_audit() from public,anon,authenticated;

-- One transaction saves the decision, invoice preparation and optional customer
-- reply. A message-only reply does not authorise work or alter pricing.
create function public.vecta_respond_progress_quote(p_job_id uuid,p_approval_id uuid,p_decision text,p_reply_id uuid,p_reply text,p_expected jsonb,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype; a public.additional_work_approvals%rowtype; e public.customer_portal_events%rowtype; result jsonb; reply text:=trim(coalesce(p_reply,''));
begin
 if p_reply_id is null or length(reply)>3000 or (p_decision is null and reply='') or (p_decision is not null and p_decision not in ('approved','declined')) then
  return jsonb_build_object('code',400,'error','Choose Accept or Refuse, or enter a message of up to 3,000 characters.');
 end if;
 select * into j from public.jobs where id=p_job_id for update;
 select * into a from public.additional_work_approvals where id=p_approval_id and job_id=p_job_id for update;
 if j.id is null or a.id is null or a.progress_review_state<>'sent' or a.progress_message is null
   or j.booking_date is distinct from a.progress_booking_date
   or lower(trim(coalesce(j.customer_email,'')))<>lower(trim(coalesce(a.customer_email,'')))
   or (a.customer_phone is not null and regexp_replace(coalesce(j.customer_phone,''),'[^0-9]','','g')<>regexp_replace(a.customer_phone,'[^0-9]','','g'))
   or regexp_replace(upper(j.registration),'[^A-Z0-9]','','g') is distinct from regexp_replace(upper(a.registration),'[^A-Z0-9]','','g')
   or coalesce(j.card_type,'job')<>'job' or coalesce(j.status,'') in ('quote','provisional','cancelled','canceled','deleted')
   or upper(coalesce(j.customer_note,'')) like '%[[VECTA_SOFT_DELETE:%' or upper(coalesce(j.customer_note,'')) like '%[[VECTA_DELETED:%'
   or coalesce(j.job_type,'') ~* 'vehicle tax|pool car tax' then
  return jsonb_build_object('code',404,'error','This quote is no longer available.');
 end if;
 if p_decision is not null then
  -- A conflicting retry cannot overwrite the first decision or its note.
  if a.status<>'pending' then
   select * into e from public.customer_portal_events where dedupe_key='approval:'||a.id::text||':'||a.status;
   if a.status<>p_decision or coalesce(e.details->>'customer_reply','')<>reply then
    return jsonb_build_object('code',409,'error','A response is already recorded. Check it, then send a separate message if needed.');
   end if;
  end if;
  result:=public.vecta_decide_progress_work(p_job_id,p_approval_id,p_decision,p_expected,p_changes);
  if result->>'code'<>'200' then return result;end if;
  select * into e from public.customer_portal_events where dedupe_key='approval:'||a.id::text||':'||p_decision;
  if e.id is null then raise exception 'Decision history is unavailable';end if;
  if a.status='pending' then
   update public.customer_portal_events set details=details||jsonb_build_object('customer_reply',reply,'response_id',p_reply_id) where id=e.id;
  end if;
  return result||jsonb_build_object('event_id',e.id,'replayed',a.status<>'pending');
 end if;
 select * into e from public.customer_portal_events where id=p_reply_id;
 if e.id is not null then
  if e.job_id=j.id and e.kind='message' and e.actor='customer' and e.details->>'approval_id'=a.id::text and e.message=reply then
   return jsonb_build_object('code',200,'event_id',e.id,'replayed',true);
  end if;
  return jsonb_build_object('code',409,'error','This reply reference was already used. Reopen the quote before sending.');
 end if;
 if j.archived or a.expires_at is null or a.expires_at<=clock_timestamp() then
  return jsonb_build_object('code',410,'error','This quote link has expired. Please contact the workshop.');
 end if;
 insert into public.customer_portal_events(id,job_id,registration,customer_email,kind,actor,message,details,manager_alert)
 values(p_reply_id,j.id,regexp_replace(upper(a.registration),'[^A-Z0-9]','','g'),lower(trim(coalesce(a.customer_email,''))),'message','customer',reply,
  jsonb_build_object('approval_id',a.id,'quote_description',a.progress_message),true);
 return jsonb_build_object('code',200,'event_id',p_reply_id,'replayed',false);
end;$$;
revoke all on function public.vecta_respond_progress_quote(uuid,uuid,text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_respond_progress_quote(uuid,uuid,text,uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
