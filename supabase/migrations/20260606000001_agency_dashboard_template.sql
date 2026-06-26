-- Add dashboard_template column to agencies so the /dashboard route can branch
-- between a coach-style layout (sales / calls / commissions) and a creator-style
-- layout (traffic / MRR / membership + community workspaces).
alter table public.agencies
  add column if not exists dashboard_template text not null default 'coach';

comment on column public.agencies.dashboard_template is
  'Which dashboard layout to render. ''coach'' = sales/calls/commissions (the coach-style). ''creator'' = traffic/MRR/community (the creator-style).';
