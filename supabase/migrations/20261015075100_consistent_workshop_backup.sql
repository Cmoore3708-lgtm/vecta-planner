-- One read snapshot covers all workshop data and its financial revision audit.
-- Deliberately not a database/schema/auth/configuration backup.
do $$begin
 if to_regclass('vecta_audit.financial_revisions') is not null then
  execute 'grant usage on schema vecta_audit to service_role';
  execute 'grant select on vecta_audit.financial_revisions to service_role';
 end if;
end;$$;
create or replace function public.vecta_export_workshop_backup()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r record;rows jsonb;data jsonb:='{}';counts jsonb:='{}';key text;total bigint:=0;
begin
 for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','vecta_audit') and c.relkind in ('r','p') and not c.relispartition
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
