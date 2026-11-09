-- Keep the existing publisher for older deployments. Review text, price and
-- photo visibility commit together; a sent estimate can only be retried unchanged.
create function public.vecta_publish_progress_estimate_review(p_job_id uuid,p_id uuid,p_pence integer,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.additional_work_approvals%rowtype; result jsonb;
begin
  if p_message is null or p_message !~ '\S' or length(p_message)>1200 then
    return jsonb_build_object('code',400,'error','Enter a customer description (up to 1,200 characters).');
  end if;
  -- Match the existing publisher's lock order, including concurrent old clients.
  perform 1 from public.jobs where id=p_job_id for share;
  select * into a from public.additional_work_approvals
    where id=p_id and job_id=p_job_id and progress_message is not null for update;
  if a.id is null then
    return jsonb_build_object('code',404,'error','This finding is no longer available.');
  end if;
  if a.progress_review_state='sent' and a.progress_message is distinct from p_message then
    return jsonb_build_object('code',409,'error','This estimate has already been sent with different wording. Refresh the job.');
  end if;
  result:=public.vecta_publish_progress_estimate(p_job_id,p_id,p_pence);
  if result->>'code'='200' then
    update public.additional_work_approvals set progress_message=p_message where id=a.id;
  end if;
  return result;
end;
$$;
revoke all on function public.vecta_publish_progress_estimate_review(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.vecta_publish_progress_estimate_review(uuid,uuid,integer,text) to service_role;
notify pgrst,'reload schema';
