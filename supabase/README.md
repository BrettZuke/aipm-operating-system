# Supabase migrations

Every file in `migrations/` has to run, in filename order, oldest first. They build on each
other: the later ones add columns and policies to tables the earlier ones create, so skipping
one does not leave you with a smaller dashboard, it leaves you with pages that come up empty
and buttons that return an error.

## Applying

### Via Supabase CLI (recommended)

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

That runs every file in this folder, in order, and keeps track of which ones it has already
done. It is the option to use if you can.

### Via the SQL editor

Open your project, go to the SQL editor, and paste each file's contents in, **in filename
order, all of them**, oldest first. Run each one before pasting the next. Nothing in this
folder is optional.

Every file is safe to run twice. If you lose your place, start again from the top: the
migrations check before they create, so re-running them does not duplicate anything or wipe
data you already have.

## What each file does

| # | File | What it adds |
|---|---|---|
| 01 | `20260501000001_extensions.sql` | UUIDs, pgcrypto, pg_trgm, and the shared enums |
| 02 | `20260501000002_workspace.sql` | profiles, accounts, agencies, agency_settings, agency_members, invitations |
| 03 | `20260501000003_roles.sql` | custom_roles, role_page_permissions, role_element_permissions, role_workspace_access, ai_role_defaults, workspace_ai_settings |
| 04 | `20260501000004_clients.sql` | clients, client_dashboard_configs, client_hub_links, client_users, client_integrations, client_transactions |
| 05 | `20260501000005_revenue.sql` | transactions, deals, campaigns, ad_campaigns, offers, goals, quotas, commission_assignments, reports, calls, call_recordings |
| 06 | `20260501000006_operations.sql` | projects, tasks, eod_form_templates, eod_reports, eoc_reports, outreach_reports, departments, department_costs, department_rhythm, department_sops, documents, content |
| 07 | `20260501000007_intelligence.sql` | ai_usage_daily, ai_usage_hourly, settoku_conversations, settoku_messages, knowledge_docs, knowledge_chunks, insights, suggested_actions, feedback, notifications, activity_log |
| 08 | `20260501000008_triggers.sql` | the updated_at trigger, the new-user trigger, and the is_agency_member / is_agency_admin helpers |
| 09 | `20260501000009_rls.sql` | row-level security on every table created so far |
| 10 | `20260507000001_knowledge_docs_search.sql` | full-text search over knowledge_docs |
| 11 | `20260507000002_webinars.sql` | webinars, webinar_registrations |
| 12 | `20260507000003_improvements.sql` | improvements |
| 13 | `20260507000004_notification_prefs.sql` | notification preference columns on profiles |
| 14 | `20260513000001_rls_for_later_tables.sql` | row-level security for the tables added in 11 to 13 |
| 15 | `20260606000001_agency_dashboard_template.sql` | the dashboard-template column on agencies |
| 16 | `20260614000001_dedupe_external_id.sql` | stops the same payment being imported twice |
| 17 | `20260617000001_lead_attribution.sql` | lead_attribution, and the function that records where a lead came from |
| 18 | `20260617000003_super_admin_escalation_guard.sql` | stops a member quietly promoting themselves to super admin |
| 19 | `20260617000004_activity_log_agency_not_null.sql` | every activity_log row must belong to a workspace |
| 20 | `20260617000005_lock_ai_usage_daily.sql` | locks the AI spend counter so it cannot be edited by hand |
| 21 | `20260723233000_content_cards.sql` | content_cards (the Content board) |
| 22 | `20260728000000_content_creators.sql` | content_creators (the Roster) |
| 23 | `20260728120000_content_machine_runs.sql` | content_machine_runs (what the daily scrape did) |
| 24 | `20260730220000_content_outliers.sql` | content_outliers (the posts worth copying) |
| 25 | `20260731040000_content_feedback.sql` | content_feedback (what you told it about a piece) |
| 26 | `20260801000000_creator_roster_fields.sql` | the Roster's depth, why and lanes fields |
| 27 | `20260801000001_dm_link_clicks.sql` | dm_link_clicks (the DM-link click log) |
| 28 | `20260902000000_research.sql` | content_posts, research_jobs, research_drafts, research_searches, research_usage (everything behind the Research tab) |
| 29 | `20260902000001_research_functions.sql` | the three functions that hand out a daily allowance and start a scan without two clicks passing the same limit |
| 30 | `20260903000000_privilege_escalation_fix.sql` | closes a privilege escalation: a member could invite themselves as owner, because an early blanket write rule was never dropped |

## Tables: 67

- **Workspace** (6): profiles, accounts, agencies, agency_settings, agency_members, invitations
- **Roles** (6): custom_roles, role_page_permissions, role_element_permissions, role_workspace_access, ai_role_defaults, workspace_ai_settings
- **Clients** (6): clients, client_dashboard_configs, client_hub_links, client_users, client_integrations, client_transactions
- **Revenue** (11): transactions, deals, campaigns, ad_campaigns, offers, goals, quotas, commission_assignments, reports, calls, call_recordings
- **Operations** (12): projects, tasks, eod_form_templates, eod_reports, eoc_reports, outreach_reports, departments, department_costs, department_rhythm, department_sops, documents, content
- **Intelligence** (11): ai_usage_daily, ai_usage_hourly, settoku_conversations, settoku_messages, knowledge_docs, knowledge_chunks, insights, suggested_actions, feedback, notifications, activity_log
- **Content Machine** (5): content_cards, content_creators, content_machine_runs, content_outliers, content_feedback
- **Growth** (5): webinars, webinar_registrations, improvements, lead_attribution, dm_link_clicks
- **Research** (5): content_posts, research_jobs, research_drafts, research_searches, research_usage

## Multi-tenant pattern

Every business table has an `agency_id uuid not null references public.agencies(id)`. The
policies in 09 use the `is_agency_member(agency_id)` helper, so every read and write is scoped
to the workspace of whoever is signed in. One database, many workspaces, and no workspace can
see another's rows.

Tables without their own agency_id (`call_recordings`, for example) inherit access through
their parent row (`calls`).

`dm_link_clicks` is the deliberate exception: it holds the email addresses of people who
clicked a DM link, so it has row-level security on and no policies at all. Nobody signed in
can read it. Only the server, using the service-role key, touches it.

The five Research tables are the other exception, in the opposite direction: members of a
workspace can READ their own rows and cannot write any of them. Every write goes through the
server with the service-role key. That is what makes the daily limits and the money caps hold:
a limit counted from rows a member could delete would not be a limit. File 28 drops the generic
read-and-write policy pair by name for those five tables, because file 09 hands one to every
table that has an `agency_id`, and takes the write grants away from the signed-in roles as well
so a later migration cannot quietly hand them back.

## Adding pgvector for RAG

When you are ready to wire up knowledge base search:

```sql
create extension if not exists vector;
alter table public.knowledge_chunks
  add column embedding vector(1536);  -- match this to your embedding model
create index on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```
