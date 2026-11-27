alter table public.tasks add column if not exists remind_at timestamptz;
create index if not exists tasks_reminder_due on public.tasks(remind_at)
  where remind_at is not null and done is not true;

create table public.task_reminder_deliveries (
  task_id uuid not null references public.tasks(id) on delete cascade,
  remind_at timestamptz not null,
  endpoint text not null references public.workshop_push_subscriptions(endpoint) on delete cascade,
  retry_at timestamptz not null,
  sent boolean not null default false,
  primary key(task_id, remind_at, endpoint)
);
alter table public.task_reminder_deliveries enable row level security;
revoke all on public.task_reminder_deliveries from public, anon, authenticated;
grant select,insert,update,delete on public.task_reminder_deliveries to service_role;

create function public.claim_task_reminders()
returns table(task_id uuid, remind_at timestamptz, endpoint text, subscription jsonb, task_text text)
language sql set search_path = '' as $$
  with candidates as (
    select t.id, t.remind_at, s.endpoint, s.subscription, t.task_text
    from public.tasks t join public.workshop_push_subscriptions s on s.audience='manager'
    left join public.task_reminder_deliveries d
      on d.task_id=t.id and d.remind_at=t.remind_at and d.endpoint=s.endpoint
    where t.done is not true and s.audience='manager'
      and t.remind_at between now()-interval '1 day' and now()
      and (d.task_id is null or (not d.sent and d.retry_at<=now()))
    order by t.remind_at,t.id,s.endpoint limit 100
  ), claimed as (
    insert into public.task_reminder_deliveries as d(task_id,remind_at,endpoint,retry_at)
    select c.id,c.remind_at,c.endpoint,now()+interval '3 minutes' from candidates c
    on conflict on constraint task_reminder_deliveries_pkey do update
      set retry_at=excluded.retry_at where not d.sent and d.retry_at<=now()
    returning d.task_id,d.remind_at,d.endpoint
  )
  select c.id,c.remind_at,c.endpoint,c.subscription,c.task_text
  from candidates c join claimed k on (c.id,c.remind_at,c.endpoint)=(k.task_id,k.remind_at,k.endpoint)
$$;
revoke all on function public.claim_task_reminders() from public, anon, authenticated;
grant execute on function public.claim_task_reminders() to service_role;
