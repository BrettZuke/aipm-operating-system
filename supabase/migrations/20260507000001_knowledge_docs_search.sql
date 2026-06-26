-- ============================================================================
-- Speed up Knowledge Library search.
--
-- Two trigram indexes (one for title, one for content_text). pg_trgm is what
-- powers fast `ilike '%term%'` on Postgres — without these the search does a
-- full sequential scan of every doc on every keystroke.
-- ============================================================================

create extension if not exists pg_trgm;

create index if not exists knowledge_docs_title_trgm
  on public.knowledge_docs using gin (title gin_trgm_ops);

create index if not exists knowledge_docs_content_trgm
  on public.knowledge_docs using gin (content_text gin_trgm_ops);

-- Also help filtering by source_type per-agency.
create index if not exists knowledge_docs_agency_type
  on public.knowledge_docs (agency_id, source_type, created_at desc);
