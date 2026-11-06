-- An approval sent by WhatsApp is tied to the original phone as well as the booking and email.
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
    where id=p_approval_id and job_id=p_job_id and progress_message is not null for update;
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
