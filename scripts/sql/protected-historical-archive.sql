-- Additive protected archive. Does not import jobs or modify financial reports.
create schema if not exists vecta_history;
revoke all on schema vecta_history from public,anon,authenticated;
grant usage on schema vecta_history to service_role;
create table if not exists vecta_history.source_datasets (
 dataset_name text not null check(dataset_name in ('CONTRACTOR_2026_JOBS','NMUK_2026_JOBS','CONTRACTOR_2026_NEW_VEHICLES','INITIAL_FLEET_VEHICLES','INITIAL_MAINTENANCE_PLANS','HISTORICAL_COMPLETION_SEED','CONTRACTOR_FINANCIAL_HISTORY','NMUK_FINANCIAL_HISTORY')),
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_commit text not null check(source_commit ~ '^[0-9a-f]{40}$'),
 entry_count integer not null check(entry_count>=0),
 payload jsonb not null check(jsonb_typeof(payload) in ('array','object')),
 archived_at timestamptz not null default clock_timestamp(),
 primary key(dataset_name,source_sha256)
);
alter table vecta_history.source_datasets enable row level security;
revoke all on vecta_history.source_datasets from public,anon,authenticated,service_role;
grant select,insert on vecta_history.source_datasets to service_role;
comment on table vecta_history.source_datasets is 'Append-only source copies; not authoritative current jobs or permission to retire historical imports.';

create or replace function public.vecta_export_workshop_backup()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r record;rows jsonb;data jsonb:='{}';counts jsonb:='{}';key text;total bigint:=0;
begin
 for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','vecta_audit','vecta_history') and c.relkind in ('r','p') and not c.relispartition
  order by n.nspname,c.relname loop
  key:=case when r.nspname='public' then r.relname else r.nspname||'.'||r.relname end;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from %I.%I t',r.nspname,r.relname) into rows;
  data:=data||jsonb_build_object(key,rows);counts:=counts||jsonb_build_object(key,jsonb_array_length(rows));
  total:=total+jsonb_array_length(rows);
 end loop;
 if not (data ?& array['jobs','customers','vehicles','invoices','invoice_lines','workshop_settings','website_booking_requests']) then
  raise exception 'Incomplete workshop schema: required backup tables are missing';
 end if;
 return jsonb_build_object('data',data,'counts',counts,'total_records',total,'snapshot_at',statement_timestamp(),
 'consistent_snapshot',true,'scope','workshop-data-and-financial-audit','schema_included',false,
 'excluded',jsonb_build_array('database schema/functions/policies','Auth identities and sessions','Storage objects','hosting secrets and settings','other database projects'));
end;$$;
revoke all on function public.vecta_export_workshop_backup() from public,anon,authenticated;
grant execute on function public.vecta_export_workshop_backup() to service_role;
