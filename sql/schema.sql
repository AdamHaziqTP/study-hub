-- ============================================================
-- Study Hub — Evidence-based Exercise Science Platform
-- PostgreSQL schema (Supabase)
--
-- Run this in the Supabase SQL Editor to create the full schema.
-- This file is the source of truth for the deployed database.
--
-- Data-model principle:
--   studies           = immutable raw PubMed record (source of truth)
--   study_context     = AI-extracted structured facts (regenerable)
--   study_assessments = qualitative evidence context
--   study_notes       = user-owned personal notes (private, RLS-locked)
--   articles/claims/evidence_links = the user's evidence graph
-- ============================================================

-- 1. Users Table (extends Supabase Auth)
--    NOTE: rows are created by the application on sign-up; never insert manually.
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Studies Table (immutable raw PubMed data)
CREATE TABLE IF NOT EXISTS studies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pmid TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  authors TEXT,
  journal TEXT,
  publication_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Study Context (AI-extracted structured facts -- safe to wipe & regenerate)
CREATE TABLE IF NOT EXISTS study_context (
  study_id UUID REFERENCES studies(id) ON DELETE CASCADE PRIMARY KEY,
  research_question TEXT,
  study_design TEXT,
  sample_size INTEGER,
  population TEXT,
  training_status TEXT,
  duration TEXT,
  intervention TEXT,
  control TEXT,
  outcomes TEXT,
  findings TEXT,
  limitations TEXT,
  -- Which input the AI actually read when generating this context:
  -- "full_text" | "abstract_only" | "provided_text"
  source_info TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3b. Study Identified Limitations (AI-derived, each grounded in a stated fact)
--     One row per potential limitation derived by reasoning from the STATED
--     design; `based_on` quotes the exact stated fact it derives from.
--     Regenerated together with study_context (delete-all + reinsert).
CREATE TABLE IF NOT EXISTS study_identified_limitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id UUID REFERENCES study_context(study_id) ON DELETE CASCADE NOT NULL,
  limitation TEXT NOT NULL,
  based_on TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_identified_limitations_study_id
  ON study_identified_limitations (study_id);

-- 3c. Study Notes (user-owned personal notes — PRIVATE, RLS-locked)
--     One consolidated note per (user, study). The user_id column defaults to
--     auth.uid() so the database fills it from the caller's JWT — the client
--     NEVER sends user_id, making it impossible to write a row on behalf of
--     someone else even before the WITH CHECK policy is evaluated.
CREATE TABLE IF NOT EXISTS study_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  -- One consolidated note per user, per study
  UNIQUE (user_id, study_id)
);

-- Postgres does not auto-index foreign key columns; index both FKs used by the
-- UNIQUE(user_id, study_id) lookup and the per-study / per-user queries.
CREATE INDEX IF NOT EXISTS idx_study_notes_user_id ON study_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_study_notes_study_id ON study_notes (study_id);

-- 4. Study Assessments (qualitative evidence profile)
CREATE TABLE IF NOT EXISTS study_assessments (
  study_id UUID REFERENCES studies(id) ON DELETE CASCADE PRIMARY KEY,
  study_design_context TEXT,
  sample_size_context TEXT,
  duration_context TEXT,
  population_context TEXT,
  relevance_context TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4b. Migration for existing deployments (Task 7)
-- Before Task 7, `articles`/`claims` had no user_id and `evidence_links` had a
-- composite (claim_id, study_id) PRIMARY KEY with no id/user_id. No feature
-- ever wrote rows to them (RLS-locked since creation), so they are guaranteed
-- EMPTY — a drop-and-recreate is zero-loss and far simpler than in-place
-- ALTERs (which would leave the old `user_id` WITHOUT the auth.uid() default).
-- On a fresh database these are no-ops and the CREATE TABLE IF NOT EXISTS
-- statements below build the final shape. Drop child-first for FK ordering.
DROP TABLE IF EXISTS evidence_links;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS articles;

-- 5. Articles Table (user's wiki-style notes/conclusions)
--    user_id references auth.users directly (same trust model as study_notes)
--    and DEFAULTS to auth.uid() so the client never sends it.
CREATE TABLE IF NOT EXISTS articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Claims Table (specific statements within an article)
--    user_id defaults to auth.uid() so RLS can lock rows to the owner just
--    like study_notes / articles.
CREATE TABLE IF NOT EXISTS claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Evidence Links (the core graph relationship)
--    Surrogate `id` PK (so the client can update/delete one link row by id) +
--    a UNIQUE (claim_id, study_id) pair so one claim cannot link the same
--    study twice. user_id defaults to auth.uid() so RLS locks rows to the
--    owner, same as articles / claims / study_notes.
CREATE TABLE IF NOT EXISTS evidence_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE NOT NULL,
  study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT CHECK (relationship IN ('supports', 'contradicts', 'mixed', 'contextual')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (claim_id, study_id)
);

-- Evidence graph FK + RLS indexes (articles/claims/evidence_links). Postgres
-- does not auto-index FKs, and the RLS policies filter on user_id, so every
-- lookup below is index-backed (per Supabase RLS performance guidance).
CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles (user_id);
CREATE INDEX IF NOT EXISTS idx_claims_article_id ON claims (article_id);
CREATE INDEX IF NOT EXISTS idx_claims_user_id ON claims (user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_claim_id ON evidence_links (claim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_study_id ON evidence_links (study_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_user_id ON evidence_links (user_id);

-- ============================================================
-- Row Level Security policies
-- ============================================================

-- Studies = shared public library: anyone can READ and INSERT, nobody can
-- UPDATE or DELETE. The raw PubMed record is source-derived; arbitrary
-- public users must not be able to modify existing cached studies.
--
-- Rationale for no public UPDATE policy:
--   /api/save-study is INSERT-only (check-then-insert). If a study already
--   exists, the endpoint returns a no-op success rather than overwriting it.
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read studies" ON studies;
CREATE POLICY "Public read studies" ON studies
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert studies" ON studies;
CREATE POLICY "Public insert studies" ON studies
  FOR INSERT WITH CHECK (true);

-- === Protected user-owned tables (require authentication) ===
ALTER TABLE study_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_links ENABLE ROW LEVEL SECURITY;

-- === articles / claims / evidence_links = PRIVATE user-owned evidence graph ===
-- Same trust model as study_notes: FOR ALL TO authenticated, locked to
-- auth.uid() = user_id with WITH CHECK so a user can never see or write a row
-- on someone else's behalf. user_id DEFAULTS to auth.uid() in the DB — the
-- client never sends it.
DROP POLICY IF EXISTS "Users can manage their own articles" ON articles;
CREATE POLICY "Users can manage their own articles" ON articles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own claims" ON claims;
CREATE POLICY "Users can manage their own claims" ON claims
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own evidence links" ON evidence_links;
CREATE POLICY "Users can manage their own evidence links" ON evidence_links
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- === Explicit grants =====================================================
-- The user-owned tables are PRIVATE: anon/public gets NOTHING, authenticated
-- gets the full lifecycle of their own rows (RLS enforces the ownership
-- boundary). These statements make the permissions explicit — REVOKE from
-- anon is belt-and-suspenders on top of the "no public policies" rule.
REVOKE ALL ON articles, claims, evidence_links, study_notes FROM anon;
GRANT ALL ON articles, claims, evidence_links, study_notes TO authenticated;

-- === study_context = shared REGENERABLE derived library =================
-- Unlike `studies` (immutable source), context is derived AI output that is
-- DESIGNED to be overwritten: a prompt/model change can regenerate it without
-- touching the source record. The public trust model is therefore
-- SELECT + INSERT + UPDATE (the server-side /api/save-context upserts on
-- study_id). DELETE stays locked -- a full-row upsert already replaces content
-- wholesale, so public deletion is never needed.
ALTER TABLE study_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read study context" ON study_context;
CREATE POLICY "Public read study context" ON study_context
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert study context" ON study_context;
CREATE POLICY "Public insert study context" ON study_context
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update study context" ON study_context;
CREATE POLICY "Public update study context" ON study_context
  FOR UPDATE USING (true) WITH CHECK (true);

-- === study_identified_limitations = shared regenerable child =============
-- Regeneration = delete all rows for a study + reinsert the new ones, so the
-- public trust model is SELECT + INSERT + DELETE (no UPDATE -- each row is
-- replaced wholesale).
ALTER TABLE study_identified_limitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read study identified limitations" ON study_identified_limitations;
CREATE POLICY "Public read study identified limitations" ON study_identified_limitations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert study identified limitations" ON study_identified_limitations;
CREATE POLICY "Public insert study identified limitations" ON study_identified_limitations
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete study identified limitations" ON study_identified_limitations;
CREATE POLICY "Public delete study identified limitations" ON study_identified_limitations
  FOR DELETE USING (true);

-- === study_notes = PRIVATE user-owned notes ============================
-- The ONLY table so far that locks rows strictly to the authenticated user
-- who owns them. No public (anon) access at all:
--   - auth.uid() = user_id  → a user can only see/edit THEIR OWN notes.
--   - WITH CHECK (auth.uid() = user_id)  → a user cannot insert a row on
--     behalf of someone else, nor re-assign an existing row to another user.
--   - FOR ALL (SELECT/INSERT/UPDATE/DELETE) → full lifecycle of the user's
--     own note under one tight policy.
ALTER TABLE study_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own notes" ON study_notes;
CREATE POLICY "Users can manage their own notes" ON study_notes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read study assessments" ON study_assessments;
CREATE POLICY "Public read study assessments" ON study_assessments
  FOR SELECT USING (true);


GRANT ALL ON public.study_notes TO authenticated;
GRANT ALL ON public.study_notes TO service_role;