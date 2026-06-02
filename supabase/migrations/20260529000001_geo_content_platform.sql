-- Migration: Create GEO & Content Automation Platform Tables
-- Run this in your Supabase SQL Editor to support keyword monitoring, query clustering, and sitemap coverage indexes.

CREATE TABLE IF NOT EXISTS geo_keywords (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phrase text NOT NULL,
  status text NOT NULL DEFAULT 'scanning',
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geo_reddit_posts (
  id text PRIMARY KEY,
  keyword_id uuid REFERENCES geo_keywords(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  subreddit text,
  author text,
  upvotes integer DEFAULT 0,
  num_comments integer DEFAULT 0,
  created_utc integer DEFAULT 0,
  selftext text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geo_clusters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id uuid REFERENCES geo_keywords(id) ON DELETE CASCADE,
  cluster_name text NOT NULL,
  core_intent text NOT NULL,
  summary text,
  total_posts integer DEFAULT 0,
  total_comments integer DEFAULT 0,
  hotness_score float DEFAULT 0.0,
  post_ids text[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS geo_llm_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id uuid REFERENCES geo_keywords(id) ON DELETE CASCADE,
  source text NOT NULL,
  topic_title text NOT NULL,
  suggested_angle text,
  priority text DEFAULT 'medium'
);

CREATE TABLE IF NOT EXISTS geo_website_index (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id uuid REFERENCES geo_keywords(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text NOT NULL,
  meta_description text,
  matching_cluster_id uuid REFERENCES geo_clusters(id) ON DELETE SET NULL,
  coverage_status text DEFAULT 'uncovered',
  scanned_at timestamp with time zone DEFAULT now()
);

-- Disable Row Level Security (RLS) to match standard client dashboard operations
ALTER TABLE geo_keywords ADD COLUMN IF NOT EXISTS ai_questions_json jsonb;

ALTER TABLE geo_keywords DISABLE ROW LEVEL SECURITY;
ALTER TABLE geo_reddit_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE geo_clusters DISABLE ROW LEVEL SECURITY;
ALTER TABLE geo_llm_suggestions DISABLE ROW LEVEL SECURITY;
ALTER TABLE geo_website_index DISABLE ROW LEVEL SECURITY;
