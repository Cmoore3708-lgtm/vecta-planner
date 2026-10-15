-- Test only: restore the snapshot into temporary tables, then compare every row.
-- This tests data recovery against an existing schema, not disaster recovery of
-- schema/Auth/Storage/hosting configuration or the separate relay project.
begin;
do $$
declare b jsonb:=public.vecta_export_workshop_backup();r record;restored jsonb;key text;target text;n bigint:=0;
begin
 for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','vecta_audit') and c.relkind in ('r','p') and not c.relispartition
  order by n.nspname,c.relname loop
  key:=case when r.nspname='public' then r.relname else r.nspname||'.'||r.relname end;
  target:='restore_check_'||r.relname;
  execute format('create temporary table %I (like %I.%I including defaults) on commit drop',target,r.nspname,r.relname);
  execute format('insert into pg_temp.%I select * from jsonb_populate_recordset(null::%I.%I,$1)',target,r.nspname,r.relname) using b->'data'->key;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from pg_temp.%I t',target) into restored;
  assert restored=b->'data'->key, 'Restored rows differ for '||key;
  assert jsonb_array_length(restored)=(b->'counts'->>key)::integer,'Restored count mismatch for '||key;
  n:=n+jsonb_array_length(restored);
 end loop;
 assert n=(b->>'total_records')::bigint,'Restored overall count mismatch';
 assert not has_function_privilege('anon','public.vecta_export_workshop_backup()','execute');
 assert not has_function_privilege('authenticated','public.vecta_export_workshop_backup()','execute');
end;$$;
rollback;
