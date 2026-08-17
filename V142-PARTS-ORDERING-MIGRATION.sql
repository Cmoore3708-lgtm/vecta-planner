create table if not exists public.job_parts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  description text not null,
  quantity numeric not null default 1,
  ordered boolean not null default false,
  arrived boolean not null default false,
  ordered_at timestamptz,
  arrived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_parts_job_id_idx on public.job_parts(job_id);

alter table public.job_parts enable row level security;

drop policy if exists "job_parts_select" on public.job_parts;
drop policy if exists "job_parts_insert" on public.job_parts;
drop policy if exists "job_parts_update" on public.job_parts;
drop policy if exists "job_parts_delete" on public.job_parts;

create policy "job_parts_select" on public.job_parts for select using (true);
create policy "job_parts_insert" on public.job_parts for insert with check (true);
create policy "job_parts_update" on public.job_parts for update using (true) with check (true);
create policy "job_parts_delete" on public.job_parts for delete using (true);
