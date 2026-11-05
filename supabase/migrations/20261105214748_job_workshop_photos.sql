-- Customer-visible evidence stays outside jobs, offline backups and planner sync.
create table public.job_workshop_photos (
 id uuid primary key,
 job_id uuid not null references public.jobs(id) on delete cascade,
 slot smallint not null check (slot between 1 and 12),
 binding text not null check (binding ~ '^[a-f0-9]{64}$'),
 content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
 caption text not null default '' check (char_length(caption) <= 500),
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 deleted_at timestamptz
);
create unique index job_workshop_photos_active_slot on public.job_workshop_photos(job_id,slot) where deleted_at is null;
alter table public.job_workshop_photos enable row level security;
revoke all on public.job_workshop_photos from public,anon,authenticated;
grant all on public.job_workshop_photos to service_role;
comment on table public.job_workshop_photos is 'Workshop-only writes via authenticated server. Customer reads are filtered by current job tracking access and vehicle/customer binding.';
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('job-workshop-photos','job-workshop-photos',false,1000000,array['image/jpeg'])
on conflict (id) do nothing;
-- No storage policies: only the authenticated workshop server has access.
