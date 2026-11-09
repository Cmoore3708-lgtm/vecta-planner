-- The customer decision and the job's invoice preparation commit together.
-- Service-only inputs are calculated from the saved job and saved estimate.
create function public.vecta_decide_progress_work(p_job_id uuid,p_approval_id uuid,p_decision text,p_expected jsonb,p_changes jsonb)
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
  if p_decision='approved' and a.status='pending' then
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
  -- Retain all booking/recipient/expiry/final-status checks and decision replay
  -- behavior from the established, service-only approval function.
  result:=public.vecta_decide_progress_approval(p_job_id,p_approval_id,p_decision);
  if result->>'code'='200' and p_decision='approved' and a.status='pending' then
    update public.jobs set work_required=p_changes->>'work_required',customer_note=p_changes->>'customer_note',
      amount_quoted=(p_changes->>'amount_quoted')::numeric,vat_mode=p_changes->>'vat_mode',updated_at=clock_timestamp() where id=j.id;
  end if;
  return result;
end;
$$;
revoke all on function public.vecta_decide_progress_work(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vecta_decide_progress_work(uuid,uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
