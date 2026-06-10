-- Contribution payload v2: custom taught buttons ride along with skip buttons.
-- Applied 2026-06-10 as migration `custom_buttons_v2`.

alter table public.submissions add column if not exists name text;
alter table public.submissions drop constraint submissions_target_check;
alter table public.submissions add constraint submissions_target_check
  check (target in ('SKIP_INTRO','SKIP_RECAP','CUSTOM'));
