-- Staged images stay ready=false, keeping them private even to older trackers.
alter table public.job_workshop_photos
  add column review_id uuid,
  add column review_uploaded boolean not null default false;
alter table public.additional_work_approvals
  add column progress_review_state text not null default 'sent' check (progress_review_state in ('draft','sent','dismissed')),
  add column progress_estimate_pence integer check (progress_estimate_pence between 0 and 99999999);
create index progress_findings_to_price on public.additional_work_approvals(created_at)
  where progress_review_state='draft';

create function public.vecta_publish_progress_estimate(p_job_id uuid,p_id uuid,p_pence integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.jobs%rowtype; a public.additional_work_approvals%rowtype; n integer; expiry timestamptz;
begin
  if p_pence is null or p_pence not between 0 and 99999999 then
    return jsonb_build_object('code',400,'error','Enter a valid estimated total.');
  end if;
  select * into j from public.jobs where id=p_job_id for share;
  select * into a from public.additional_work_approvals where id=p_id and job_id=p_job_id and progress_message is not null for update;
  if j.id is null or a.id is null or j.booking_date is distinct from a.progress_booking_date
    or lower(trim(coalesce(j.customer_email,''))) <> lower(trim(coalesce(a.customer_email,'')))
    or regexp_replace(coalesce(j.customer_phone,''),'[^0-9]','','g') <> regexp_replace(coalesce(a.customer_phone,''),'[^0-9]','','g')
    or regexp_replace(upper(j.registration),'[^A-Z0-9]','','g') is distinct from regexp_replace(upper(a.registration),'[^A-Z0-9]','','g')
    or j.archived or coalesce(j.card_type,'job')<>'job' or lower(coalesce(j.status,'')) in
      ('quote','provisional','cancelled','canceled','deleted','work_complete','ready_to_invoice','completed','invoiced','invoice_created')
    or strpos(upper(coalesce(j.customer_note,'')),'[[VECTA_SOFT_DELETE')>0 or strpos(upper(coalesce(j.customer_note,'')),'[[VECTA_DELETED')>0
    or coalesce(j.job_type,'') ~* 'vehicle tax|pool car tax' then
    return jsonb_build_object('code',409,'error','The job or its contact has changed. Reopen it before sending.');
  end if;
  if a.progress_review_state='sent' and a.status='pending' and a.progress_estimate_pence=p_pence then
    return jsonb_build_object('code',200);
  end if;
  if a.progress_review_state<>'draft' or a.status<>'pending' then
    return jsonb_build_object('code',409,'error','This finding has already been reviewed. Refresh the job.');
  end if;
  expiry:=least(clock_timestamp()+interval '7 days', (j.booking_date::timestamp at time zone 'UTC')+interval '8 days');
  if expiry<=clock_timestamp() then return jsonb_build_object('code',410,'error','The booking tracking period has ended.'); end if;
  perform 1 from public.job_workshop_photos where id=any(a.progress_photo_ids) and job_id=j.id
    and review_id=a.id and review_uploaded and deleted_at is null for update;
  get diagnostics n = row_count;
  if n<>cardinality(a.progress_photo_ids) then
    return jsonb_build_object('code',409,'error','Photos have changed. Review the finding before sending.');
  end if;
  update public.job_workshop_photos set ready=true,review_uploaded=false where id=any(a.progress_photo_ids) and review_id=a.id;
  update public.additional_work_approvals set progress_estimate_pence=p_pence,progress_review_state='sent',expires_at=expiry where id=a.id;
  return jsonb_build_object('code',200);
end;
$$;
revoke all on function public.vecta_publish_progress_estimate(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.vecta_publish_progress_estimate(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';

create or replace function public.vecta_decide_progress_approval(p_job_id uuid, p_approval_id uuid, p_decision text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job public.jobs%rowtype;
  approval public.additional_work_approvals%rowtype;
begin
  if p_decision is null or p_decision not in ('approved','declined') then
    return jsonb_build_object('code',400,'error','Choose Approve or Decline.');
  end if;
  -- Check the same customer and booking while locked. An old link must not
  -- authorise work on a reassigned job, even during a concurrent correction.
  select * into job from public.jobs where id=p_job_id for share;
  select * into approval from public.additional_work_approvals
    where id=p_approval_id and job_id=p_job_id and progress_message is not null and progress_review_state='sent' for update;
  if job.id is null or approval.id is null or job.booking_date is distinct from approval.progress_booking_date
    or lower(trim(coalesce(job.customer_email,''))) <> lower(trim(coalesce(approval.customer_email,'')))
    or (approval.customer_phone is not null and regexp_replace(coalesce(job.customer_phone,''),'[^0-9]','','g')
      <> regexp_replace(approval.customer_phone,'[^0-9]','','g'))
    or regexp_replace(upper(job.registration),'[^A-Z0-9]','','g') is distinct from regexp_replace(upper(approval.registration),'[^A-Z0-9]','','g')
    or coalesce(job.card_type,'job') <> 'job'
    or lower(coalesce(job.status,'')) in ('quote','provisional','cancelled','canceled','deleted')
    or upper(coalesce(job.customer_note,'')) like '%[[VECTA_SOFT_DELETE:%'
    or upper(coalesce(job.customer_note,'')) like '%[[VECTA_DELETED:%'
    or coalesce(job.job_type,'') ~* 'vehicle tax|pool car tax' then
    return jsonb_build_object('code',404,'error','This approval is no longer available.');
  end if;
  if approval.status <> 'pending' then
    if approval.status <> p_decision then
      return jsonb_build_object('code',409,'error','A different decision has already been recorded.');
    end if;
  else
    if job.archived or lower(job.status) in ('work_complete','ready_to_invoice','completed','invoiced','invoice_created')
       or approval.expires_at <= clock_timestamp() then
      return jsonb_build_object('code',410,'error','This approval request is closed.');
    end if;
    update public.additional_work_approvals set status=p_decision, decided_at=clock_timestamp()
      where id=approval.id returning * into approval;
  end if;
  return jsonb_build_object('code',200,'status',approval.status,'decided_at',approval.decided_at);
end;
$$;
revoke all on function public.vecta_decide_progress_approval(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vecta_decide_progress_approval(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
