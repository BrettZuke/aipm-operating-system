# Supabase migrations

Apply in order, top to bottom:

| # | File | Purpose |
|---|---|---|
| 01 | `20260501000001_extensions.sql` | UUIDs, pgcrypto, pg_trgm, enums |
| 02 | `20260501000002_workspace.sql` | profiles, accounts, agencies, agency_members, agency_settings, invitations |
| 03 | `20260501000003_roles.sql` | custom_roles, role_*_permissions, ai_role_defaults, workspace_ai_settings |
| 04 | `20260501000004_clients.sql` | clients, client_users, client_dashboard_configs, client_hub_links, client_integrations, client_transactions |
| 05 | `20260501000005_revenue.sql` | transactions, deals, campaigns, ad_campaigns, offers, goals, quotas, commission_assignments, reports, calls, call_recordings |
| 06 | `20260501000006_operations.sql` | projects, tasks, eod_*, eoc_reports, outreach_reports, departments, department_*, documents, content |
| 07 | `20260501000007_intelligence.sql` | ai_usage_*, settoku_conversations, settoku_messages, knowledge_docs, knowledge_chunks, insights, suggested_actions, feedback, notifications, activity_log |
| 08 | `20260501000008_triggers.sql` | updated_at trigger, handle_new_user trigger, is_agency_member/admin helpers |
| 09 | `20260501000009_rls.sql` | Row-level security policies on all tables |

## Applying

### Via Supabase CLI (recommended)
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### Via SQL editor
Paste each file's contents into the Supabase Dashboard SQL editor in order.

## Tables count: 41

Domains:
- **Workspace** (5): profiles, accounts, agencies, agency_settings, agency_members, invitations
- **Roles** (5): custom_roles, role_page_permissions, role_element_permissions, role_workspace_access, ai_role_defaults
- **AI settings** (1): workspace_ai_settings
- **Clients** (6): clients, client_dashboard_configs, client_hub_links, client_users, client_integrations, client_transactions
- **Revenue** (11): transactions, deals, campaigns, ad_campaigns, offers, goals, quotas, commission_assignments, reports, calls, call_recordings
- **Operations** (12): projects, tasks, eod_form_templates, eod_reports, eoc_reports, outreach_reports, departments, department_costs, department_rhythm, department_sops, documents, content
- **Intelligence** (10): ai_usage_daily, ai_usage_hourly, settoku_conversations, settoku_messages, knowledge_docs, knowledge_chunks, insights, suggested_actions, feedback, notifications, activity_log

## Multi-tenant pattern

Every business table includes an `agency_id uuid not null references public.agencies(id)`. RLS policies in 09 use the `is_agency_member(agency_id)` helper to scope all reads/writes to the calling user's agency.

Junction tables that don't have agency_id directly (e.g., `call_recordings`) inherit access via the parent (`calls` → agency_id).

## Adding pgvector for RAG

When ready to wire up knowledge base RAG:

```sql
create extension if not exists vector;
alter table public.knowledge_chunks
  add column embedding vector(1536);  -- adjust dim to your embedding model
create index on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```
