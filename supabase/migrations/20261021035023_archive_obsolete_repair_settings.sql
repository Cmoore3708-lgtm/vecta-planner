set lock_timeout='5s';
create table if not exists vecta_history.retired_workshop_settings (
 id text primary key, value jsonb not null, updated_at timestamptz,
 archived_at timestamptz not null default now(),
 reason text not null default 'One-off repair snapshot retired from live settings on 2026-10-21'
);
alter table vecta_history.retired_workshop_settings enable row level security;
revoke all on vecta_history.retired_workshop_settings from public,anon,authenticated,service_role;
grant select,insert on vecta_history.retired_workshop_settings to service_role;
do $$
declare r record; candidate_count integer:=0;
begin
 for r in select * from public.workshop_settings where updated_at < '2026-10-01'::timestamptz and
 (id like 'backup:%' or id like 'fleet_state_backup_before_%' or id='fleet_state_v77_backup_20260916_before_test_promotion') for update loop
 insert into vecta_history.retired_workshop_settings(id,value,updated_at) values(r.id,r.value,r.updated_at) on conflict(id) do nothing;
 if not exists(select 1 from vecta_history.retired_workshop_settings a where a.id=r.id and a.value=r.value and a.updated_at is not distinct from r.updated_at) then
 raise exception 'Archive mismatch for %',r.id; end if;
 delete from public.workshop_settings where id=r.id;
 candidate_count:=candidate_count+1;
 end loop;
 raise notice 'Archived % obsolete repair snapshots',candidate_count;
end $$;
