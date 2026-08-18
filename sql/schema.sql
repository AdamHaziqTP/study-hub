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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

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

-- 5. Articles Table (user's wiki-style notes/conclusions)
CREATE TABLE IF NOT EXISTS articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Claims Table (specific statements within an article)
CREATE TABLE IF NOT EXISTS claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL
);

-- 7. Evidence Links (the core graph relationship)
CREATE TABLE IF NOT EXISTS evidence_links (
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE NOT NULL,
  study_id UUID REFERENCES studies(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT CHECK (relationship IN ('supports', 'contradicts', 'mixed', 'contextual')) NOT NULL,
  PRIMARY KEY (claim_id, study_id)
);

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

-- === Protected tables (require authentication, added later) ============
ALTER TABLE study_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_links ENABLE ROW LEVEL SECURITY;

-- Derived from a shared study: read-only access mirrors public studies.
DROP POLICY IF EXISTS "Public read study context" ON study_context;
CREATE POLICY "Public read study context" ON study_context
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read study assessments" ON study_assessments;
CREATE POLICY "Public read study assessments" ON study_assessments
  FOR SELECT USING (true);
