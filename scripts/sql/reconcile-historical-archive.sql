-- Read-only aggregate reconciliation. Does not establish permission to retire imports.
with history as (
 select jsonb_array_elements(payload) as job from vecta_history.source_datasets
 where dataset_name in ('CONTRACTOR_2026_JOBS','NMUK_2026_JOBS')
), corrections as (
 select coalesce(value->'financeCorrections','{}'::jsonb) as data
 from public.workshop_settings where id='main'
)
select jsonb_build_object(
 'source_jobs',(select count(*) from history),
 'cloud_primary_key_matches',(select count(*) from history h join public.jobs j on j.id::text=h.job->>'id'),
 'saved_corrections',(select count(*) from corrections,jsonb_object_keys(data)),
 'historical_jobs_with_corrections',(select count(*) from history h,corrections c where c.data ? (h.job->>'id')),
 'source_amount_total',(select sum((job->>'amount_quoted')::numeric) from history),
 'effective_amount_total',(select sum(((h.job||coalesce(c.data->(h.job->>'id'),'{}'::jsonb))->>'amount_quoted')::numeric) from history h cross join corrections c),
 'retirement_ready',false
) as historical_reconciliation;
