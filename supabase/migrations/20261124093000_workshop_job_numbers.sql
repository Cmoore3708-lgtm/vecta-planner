-- Serialize the initial schedule and all subsequent allocations across devices.
lock table public.jobs in share row exclusive mode;
alter table public.jobs add column job_number integer unique;

create schema if not exists vecta_private;
create table vecta_private.job_number_counter (
  singleton boolean primary key default true check (singleton),
  last_number integer not null
);
revoke all on vecta_private.job_number_counter from public, anon, authenticated;

with numbered as (
  select id, 45216 + row_number() over (
    order by booking_date, drop_time nulls last, created_at, id
  ) as number
  from public.jobs
  where booking_date >= date '2026-11-23' and card_type = 'job'
    and not coalesce(mini_task, false) and status is distinct from 'deleted'
)
update public.jobs j set job_number = numbered.number
from numbered where j.id = numbered.id;

insert into vecta_private.job_number_counter(last_number)
select coalesce(max(job_number), 45216) from public.jobs;

create function vecta_private.assign_job_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.job_number := old.job_number;
    if old.job_number is not null or
       (old.card_type = 'job' and not coalesce(old.mini_task,false)) then
      return new;
    end if;
  end if;
  new.job_number := null;
  if new.card_type is distinct from 'job' or coalesce(new.mini_task,false)
     or new.status = 'deleted' then return new; end if;

  perform 1 from vecta_private.job_number_counter where singleton for update;
  if tg_op = 'INSERT' then
    select job_number into new.job_number from public.jobs where id = new.id;
    if found then return new; end if;
  end if;
  update vecta_private.job_number_counter set last_number = last_number + 1
    where singleton returning last_number into strict new.job_number;
  return new;
end;
$$;
revoke all on function vecta_private.assign_job_number() from public, anon, authenticated;
create trigger vecta_assign_job_number before insert or update on public.jobs
for each row execute function vecta_private.assign_job_number();
