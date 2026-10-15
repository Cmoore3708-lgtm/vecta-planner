-- Optional approval feature: keep bearer tokens and contact snapshots server-only.
create table if not exists public.additional_work_approvals (
 id uuid primary key default gen_random_uuid(), token text not null unique,
 job_id uuid not null references public.jobs(id), registration text, vehicle text,
 customer_name text, customer_email text, customer_phone text,
 items jsonb not null, total numeric not null,
 status text not null default 'pending' check(status in ('pending','approved','declined')),
 expires_at timestamptz, decided_at timestamptz, created_at timestamptz not null default now()
);
alter table public.additional_work_approvals enable row level security;
revoke all on public.additional_work_approvals from anon, authenticated;
grant select,insert,update,delete on public.additional_work_approvals to service_role;

create or replace function public.vecta_decide_additional_work(p_token text,p_decision text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.additional_work_approvals%rowtype; stamp text; approved_work text;
begin
 if p_decision not in ('approved','declined') or p_decision is null or coalesce(p_token,'')='' then
  return jsonb_build_object('code',400,'error','Valid token and decision required');
 end if;
 select * into a from public.additional_work_approvals where token=p_token for update;
 if not found then return jsonb_build_object('code',404,'error','Approval request not found');end if;
 if a.status<>'pending' then
  if a.status=p_decision then return jsonb_build_object('code',200,'ok',true,'status',a.status,'decided_at',a.decided_at,'replayed',true);end if;
  return jsonb_build_object('code',409,'error','This request has already been decided','status',a.status);
 end if;
 if a.expires_at<=clock_timestamp() then return jsonb_build_object('code',410,'error','This approval request has expired');end if;
 select 'Additional work '||upper(p_decision)||' by customer: '||string_agg((item->>'description')||' (£'||to_char(coalesce((item->>'price')::numeric,0),'FM999999990.00')||')','; ' order by ordinal),
 'APPROVED ADDITIONAL WORK: '||string_agg(item->>'description','; ' order by ordinal)
 into stamp,approved_work from jsonb_array_elements(a.items) with ordinality as x(item,ordinal);
 -- The job update and decision commit together. An error rolls back both.
 update public.jobs set customer_note=concat_ws(' · ',nullif(customer_note,''),stamp),
 work_required=case when p_decision='approved' then concat_ws(E'\n',nullif(work_required,''),approved_work) else work_required end
 where id=a.job_id;
 if not found then raise exception 'Approval job no longer exists';end if;
 update public.additional_work_approvals set status=p_decision,decided_at=clock_timestamp() where id=a.id returning * into a;
 return jsonb_build_object('code',200,'ok',true,'status',a.status,'decided_at',a.decided_at,'replayed',false);
end;
$$;
revoke all on function public.vecta_decide_additional_work(text,text) from public,anon,authenticated;
grant execute on function public.vecta_decide_additional_work(text,text) to service_role;
