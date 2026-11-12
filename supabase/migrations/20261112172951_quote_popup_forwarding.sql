-- Existing accepted work was applied at decision time. Preserve that history.
alter table public.additional_work_approvals
 add column progress_parts jsonb not null default '[]'::jsonb check(jsonb_typeof(progress_parts)='array'),
 add column progress_apply_on_forward boolean not null default false,
 add column progress_work_applied_at timestamptz;
update public.additional_work_approvals set progress_apply_on_forward=true where status='pending' and progress_message is not null;
alter table public.additional_work_approvals alter column progress_apply_on_forward set default true;
-- The customer decision and the job's invoice preparation commit together.
-- Service-only inputs are calculated from the saved job and saved estimate.
create or replace function public.vecta_decide_progress_work(p_job_id uuid,p_approval_id uuid,p_decision text,p_expected jsonb,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype; a public.additional_work_approvals%rowtype; result jsonb;
begin
  -- Match publisher lock order. Exclusive job lock serialises two approvals
  -- and prevents a concurrent job edit from losing either accepted charge.
  select * into j from public.jobs where id=p_job_id for update;
  select * into a from public.additional_work_approvals where id=p_approval_id and job_id=p_job_id for update;
  if j.id is null or a.id is null then
    return jsonb_build_object('code',404,'error','This approval is no longer available.');
  end if;
  if p_decision='approved' and a.status='pending' and not a.progress_apply_on_forward then
    if p_expected is null or p_changes is null or
      j.updated_at is distinct from (p_expected->>'updated_at')::timestamptz or
      j.work_required is distinct from (p_expected->>'work_required') or
      j.customer_note is distinct from (p_expected->>'customer_note') or
      j.amount_quoted is distinct from (p_expected->>'amount_quoted')::numeric or
      j.vat_mode is distinct from (p_expected->>'vat_mode') then
      return jsonb_build_object('code',409,'error','The workshop just updated this job. Check the message again, then approve.');
    end if;
    if exists(select 1 from public.invoices where (job_id=j.id or fleet_job_ids @> jsonb_build_array(j.id::text)) and coalesce(status,'saved') not in ('draft','void','cancelled','deleted')) then
      return jsonb_build_object('code',409,'error','The invoice has already been prepared. Please contact the workshop before approving more work.');
    end if;
    if jsonb_typeof(p_changes->'amount_quoted')<>'number' or not(p_changes ?& array['work_required','customer_note','amount_quoted','vat_mode']) then
      raise exception 'Incomplete approved job update';
    end if;
  end if;
  if p_decision='approved' and a.status='pending' and exists(select 1 from public.invoices where (job_id=j.id or fleet_job_ids @> jsonb_build_array(j.id::text)) and coalesce(status,'saved') not in ('draft','void','cancelled','deleted')) then
    return jsonb_build_object('code',409,'error','The invoice has already been prepared. Please contact the workshop.');
  end if;
  -- Retain all booking/recipient/expiry/final-status checks and decision replay
  -- behavior from the established, service-only approval function.
  result:=public.vecta_decide_progress_approval(p_job_id,p_approval_id,p_decision);
  if result->>'code'='200' and p_decision='approved' and a.status='pending' and not a.progress_apply_on_forward then
    update public.jobs set work_required=p_changes->>'work_required',customer_note=p_changes->>'customer_note',
      amount_quoted=(p_changes->>'amount_quoted')::numeric,vat_mode=p_changes->>'vat_mode',updated_at=clock_timestamp() where id=j.id;
  end if;
  return result;
end;
$$;
revoke all on function public.vecta_decide_progress_work(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_decide_progress_work(uuid,uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
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
  jsonb_build_object('approval_id',new.id,'status',new.status,'estimated_pence',new.progress_estimate_pence,'parts',new.progress_parts,'photo_ids',new.progress_photo_ids),
  case when k='approval_response' then coalesce(new.decided_at,clock_timestamp()) else clock_timestamp() end,
  k='approval_response',null,
  'approval:'||new.id::text||':'||new.status) on conflict(dedupe_key) do nothing;
 return new;
end;$$;
revoke all on function public.vecta_portal_approval_audit() from public,anon,authenticated;

create or replace function public.vecta_forward_portal_event(p_id uuid,p_message text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.customer_portal_events%rowtype;j public.jobs%rowtype;
begin
 select * into e from public.customer_portal_events where id=p_id;
 if e.id is null or e.actor<>'customer' or e.job_id is null then return jsonb_build_object('code',409,'error','Accept this booking before sending it to a mechanic.');end if;
 select * into j from public.jobs where id=e.job_id for update;
 select * into e from public.customer_portal_events where id=p_id for update;
 if regexp_replace(upper(j.registration),'[^A-Z0-9]','','g')<>e.registration or lower(trim(coalesce(j.customer_email,'')))<>e.customer_email then return jsonb_build_object('code',409,'error','The booking customer changed.');end if;
 if e.kind='approval_response' and e.mechanic_at is null then
  return jsonb_build_object('code',409,'error','Refresh Workshop Pro before forwarding this quote response.');
 end if;
 if e.mechanic_at is null then
  update public.customer_portal_events set mechanic_at=clock_timestamp(),mechanic_message=p_message where id=e.id;
  update public.jobs set updated_at=clock_timestamp() where id=e.job_id;
 end if;
 return jsonb_build_object('code',200,'event_id',e.id,'already_forwarded',e.mechanic_at is not null);
end;$$;
revoke all on function public.vecta_forward_portal_event(uuid,text) from public,anon,authenticated;
grant execute on function public.vecta_forward_portal_event(uuid,text) to service_role;

-- Lock order matches customer decisions. Calculated changes use a saved-job CAS.
create function public.vecta_forward_quote_response(p_id uuid,p_message text,p_expected jsonb,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.customer_portal_events%rowtype; j public.jobs%rowtype; a public.additional_work_approvals%rowtype; apply_work boolean;
begin
 select * into e from public.customer_portal_events where id=p_id;
 if e.id is null or e.actor<>'customer' or e.kind<>'approval_response' or e.job_id is null then return jsonb_build_object('code',409,'error','Choose a customer quote response.');end if;
 select * into j from public.jobs where id=e.job_id for update;
 select * into a from public.additional_work_approvals where id=(e.details->>'approval_id')::uuid and job_id=e.job_id for update;
 select * into e from public.customer_portal_events where id=p_id for update;
 if j.id is null or a.id is null or a.progress_review_state<>'sent' or a.status not in ('approved','declined') or a.status is distinct from (e.details->>'status')
  or regexp_replace(upper(j.registration),'[^A-Z0-9]','','g') is distinct from e.registration
  or regexp_replace(upper(a.registration),'[^A-Z0-9]','','g') is distinct from e.registration
  or lower(trim(coalesce(j.customer_email,'')))<>e.customer_email or lower(trim(coalesce(a.customer_email,'')))<>e.customer_email
  or j.booking_date is distinct from a.progress_booking_date
  or (a.customer_phone is not null and regexp_replace(coalesce(j.customer_phone,''),'[^0-9]','','g')<>regexp_replace(a.customer_phone,'[^0-9]','','g'))
  or coalesce(j.card_type,'job')<>'job' or coalesce(j.status,'') in ('quote','provisional','cancelled','canceled','deleted')
  or upper(coalesce(j.customer_note,'')) like '%[[VECTA_SOFT_DELETE:%' or upper(coalesce(j.customer_note,'')) like '%[[VECTA_DELETED:%' then
  return jsonb_build_object('code',409,'error','The job or customer changed. Reopen the job before forwarding.');
 end if;
 if e.mechanic_at is not null then return jsonb_build_object('code',200,'already_forwarded',true);end if;
 if p_expected is null or p_changes is null or
  j.updated_at is distinct from (p_expected->>'updated_at')::timestamptz or j.work_required is distinct from (p_expected->>'work_required') or
  j.customer_note is distinct from (p_expected->>'customer_note') or j.amount_quoted is distinct from (p_expected->>'amount_quoted')::numeric or j.vat_mode is distinct from (p_expected->>'vat_mode') then
  return jsonb_build_object('code',409,'error','The job just changed. Retry Send to mechanic to use its latest details.');
 end if;
 apply_work:=a.status='approved' and a.progress_apply_on_forward and a.progress_work_applied_at is null;
 if apply_work and (j.archived or j.status in ('work_complete','ready_to_invoice','completed','invoiced','invoice_created') or exists(select 1 from public.invoices where (job_id=j.id or fleet_job_ids @> jsonb_build_array(j.id::text)) and coalesce(status,'saved') not in ('draft','void','cancelled','deleted'))) then
  return jsonb_build_object('code',409,'error','This job is finished or invoiced. Reopen it before adding approved work.');
 end if;
 if not(p_changes ?& array['work_required','customer_note','amount_quoted','vat_mode']) or (apply_work and jsonb_typeof(p_changes->'amount_quoted')<>'number') then raise exception 'Incomplete quote job update';end if;
 if not apply_work and (j.amount_quoted is distinct from (p_changes->>'amount_quoted')::numeric or j.vat_mode is distinct from (p_changes->>'vat_mode') or j.work_required is distinct from (p_changes->>'work_required')) then raise exception 'A declined or applied quote cannot change work or pricing';end if;
 update public.jobs set work_required=p_changes->>'work_required',customer_note=p_changes->>'customer_note',amount_quoted=(p_changes->>'amount_quoted')::numeric,vat_mode=p_changes->>'vat_mode',updated_at=clock_timestamp() where id=j.id;
 if apply_work then update public.additional_work_approvals set progress_work_applied_at=clock_timestamp() where id=a.id;end if;
 update public.customer_portal_events set mechanic_at=clock_timestamp(),mechanic_message=p_message where id=e.id;
 return jsonb_build_object('code',200,'already_forwarded',false);
end;$$;
revoke all on function public.vecta_forward_quote_response(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_forward_quote_response(uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
