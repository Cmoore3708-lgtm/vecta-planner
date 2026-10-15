-- Synthetic only; exercises private archive backup coverage without durable data.
begin;
set local role service_role;
insert into vecta_history.source_datasets(dataset_name,source_sha256,source_commit,entry_count,payload)
values('CONTRACTOR_2026_JOBS',repeat('a',64),repeat('b',40),1,'[{"id":"synthetic-archive-fixture","total":120}]');
do $$declare b jsonb:=public.vecta_export_workshop_backup();begin
 assert b->'data' ? 'vecta_history.source_datasets','Archive missing from backup';
 assert (b->'counts'->>'vecta_history.source_datasets')::integer=(select count(*) from vecta_history.source_datasets),'Archive count wrong';
 assert not has_schema_privilege('anon','vecta_history','USAGE');
 assert not has_schema_privilege('authenticated','vecta_history','USAGE');
 assert not has_table_privilege('authenticated','vecta_history.source_datasets','SELECT');
 assert not has_table_privilege('service_role','vecta_history.source_datasets','UPDATE');
 assert not has_table_privilege('service_role','vecta_history.source_datasets','DELETE');
end;$$;
rollback;
