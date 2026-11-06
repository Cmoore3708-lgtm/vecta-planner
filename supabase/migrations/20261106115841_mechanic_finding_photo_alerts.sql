-- Existing and manager-created findings stay in the pricing queue without being
-- announced as new mechanic submissions.
alter table public.additional_work_approvals
  add column progress_from_mechanic boolean not null default false;
notify pgrst, 'reload schema';
