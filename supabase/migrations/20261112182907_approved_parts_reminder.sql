-- Independent, shared ordering receipts. Forwarding/read status never clears these.
alter table public.additional_work_approvals
 add column if not exists progress_parts_required boolean not null default false,
 add column if not exists progress_parts_ordered_at timestamptz,
 add column if not exists progress_parts_order_id uuid;
update public.additional_work_approvals set progress_parts_required=true
 where jsonb_array_length(progress_parts)>0;
create index if not exists approvals_pending_parts on public.additional_work_approvals(id)
 where status='approved' and progress_parts_required and progress_parts_ordered_at is null;

create or replace function public.vecta_record_quote_parts_order(p_job_id uuid,p_approval_ids uuid[],p_order_id uuid,p_undo boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.jobs%rowtype;a public.additional_work_approvals%rowtype;confirmed uuid[]:='{}';undoable uuid[]:='{}';
begin
 if p_job_id is null or p_order_id is null or p_undo is null or coalesce(cardinality(p_approval_ids),0) not between 1 and 100
 or exists(select 1 from unnest(p_approval_ids) x where x is null)
 or (select count(distinct x) from unnest(p_approval_ids) x)<>cardinality(p_approval_ids) then
  return jsonb_build_object('code',400,'error','Choose the parts reminder again.');
 end if;
 -- Same lock order as customer decisions and office forwarding.
 select * into j from public.jobs where id=p_job_id for update;
 if not found or coalesce(j.archived,false) or j.status in ('cancelled','deleted','completed','invoiced','invoice_created','ready_to_invoice') then
  return jsonb_build_object('code',409,'error','This job has closed. Refresh the dashboard.');
 end if;
 perform id from public.additional_work_approvals where id=any(p_approval_ids) order by id for update;
 if (select count(*) from public.additional_work_approvals where id=any(p_approval_ids))<>cardinality(p_approval_ids) then
  return jsonb_build_object('code',409,'error','The quote has changed. Refresh the dashboard.');
 end if;
 -- Validate the entire batch before writing any receipt. A newer approval not
 -- included in the clicked snapshot remains outstanding automatically.
 for a in select * from public.additional_work_approvals where id=any(p_approval_ids) loop
  if a.job_id is distinct from j.id or a.status is distinct from 'approved' or not a.progress_parts_required
  or a.progress_review_state is distinct from 'sent'
  or regexp_replace(upper(coalesce(a.registration,'')),'[^A-Z0-9]','','g')<>regexp_replace(upper(coalesce(j.registration,'')),'[^A-Z0-9]','','g')
  or lower(trim(coalesce(a.customer_email,'')))<>lower(trim(coalesce(j.customer_email,''))) then
   return jsonb_build_object('code',409,'error','The job or authorised parts have changed. Refresh the dashboard.');
  end if;
  if p_undo and a.progress_parts_order_id is not null and a.progress_parts_order_id<>p_order_id then
   return jsonb_build_object('code',409,'error','These parts were updated elsewhere. Refresh before changing their order status.');
  end if;
 end loop;
 for a in select * from public.additional_work_approvals where id=any(p_approval_ids) loop
  if p_undo then
   update public.additional_work_approvals set progress_parts_ordered_at=null,progress_parts_order_id=null where id=a.id and progress_parts_order_id=p_order_id;
  elsif a.progress_parts_ordered_at is null then
   update public.additional_work_approvals set progress_parts_ordered_at=clock_timestamp(),progress_parts_order_id=p_order_id where id=a.id;
   undoable:=array_append(undoable,a.id);
  elsif a.progress_parts_order_id=p_order_id then
   undoable:=array_append(undoable,a.id);
  end if;
  confirmed:=array_append(confirmed,a.id);
 end loop;
 return jsonb_build_object('code',200,'confirmed_ids',confirmed,'undo_ids',undoable);
end;$$;
revoke all on function public.vecta_record_quote_parts_order(uuid,uuid[],uuid,boolean) from public,anon,authenticated;
grant execute on function public.vecta_record_quote_parts_order(uuid,uuid[],uuid,boolean) to service_role;
notify pgrst,'reload schema';
