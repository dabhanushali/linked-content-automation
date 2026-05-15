-- Reddit Integration — Supabase Schema
-- Run this in your Supabase SQL Editor AFTER the main schema.sql

-- ============================================================
-- 1. Reddit Identities (must be created before subreddits due to FK)
-- ============================================================
create table if not exists reddit_identities (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  identity_text text not null,
  goals_text text not null,
  rules_text text not null,
  is_default boolean default false,
  created_at timestamp with time zone default now()
);

alter table reddit_identities disable row level security;

-- ============================================================
-- 2. Reddit Tones (must be created before subreddits due to FK)
-- ============================================================
create table if not exists reddit_tones (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text not null,
  is_preset boolean default false,
  created_at timestamp with time zone default now()
);

alter table reddit_tones disable row level security;

-- Seed preset tones
insert into reddit_tones (name, description, is_preset) values
  ('Professional', 'Clear, authoritative, and data-driven. Uses industry terminology naturally. Avoids slang but stays conversational. Structures arguments logically with evidence.', true),
  ('Sarcastic & Witty', 'Sharp humor with a point. Uses irony and unexpected comparisons. Never mean-spirited but always has an edge. Makes complex topics entertaining.', true),
  ('Storyteller', 'Narrative-driven with personal anecdotes. Uses "I" perspective. Builds tension and delivers payoffs. Makes abstract concepts concrete through lived experience.', true),
  ('Controversial', 'Takes strong positions against popular opinion. Backs claims with specific evidence. Challenges assumptions directly. Invites debate without being inflammatory.', true)
on conflict do nothing;

-- ============================================================
-- 3. Reddit Subreddits
-- ============================================================
create table if not exists reddit_subreddits (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  display_name text not null,
  rules_raw text,
  rules_clean text,
  last_scraped_at timestamp with time zone,
  active_tone_id uuid references reddit_tones(id) on delete set null,
  active_identity_id uuid references reddit_identities(id) on delete set null,
  created_at timestamp with time zone default now()
);

alter table reddit_subreddits disable row level security;
create index if not exists idx_reddit_subreddits_name on reddit_subreddits(name);

-- ============================================================
-- 4. Reddit Scrape Runs
-- ============================================================
create table if not exists reddit_scrape_runs (
  id uuid default gen_random_uuid() primary key,
  command_text text not null,
  parsed_intent jsonb,
  actor_used text,
  result_count integer default 0,
  results_json text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'failed')),
  created_at timestamp with time zone default now()
);

alter table reddit_scrape_runs disable row level security;
create index if not exists idx_reddit_scrape_runs_created on reddit_scrape_runs(created_at desc);

-- ============================================================
-- 5. Engagement Library
-- ============================================================
create table if not exists engagement_library (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  body text,
  subreddit text,
  author text,
  score integer default 0,
  comment_count integer default 0,
  url text,
  note text,
  tags text[] default '{}',
  scrape_run_id uuid references reddit_scrape_runs(id) on delete set null,
  created_at timestamp with time zone default now()
);

alter table engagement_library disable row level security;
create index if not exists idx_engagement_library_subreddit on engagement_library(subreddit);
create index if not exists idx_engagement_library_score on engagement_library(score desc);

-- ============================================================
-- 6. Reddit Monitors
-- ============================================================
create table if not exists reddit_monitors (
  id uuid default gen_random_uuid() primary key,
  subreddit text not null,
  keyword text not null,
  check_interval_minutes integer not null default 60,
  service text not null default 'reddit_api'
    check (service in ('reddit_api', 'firecrawl', 'tavily')),
  sort text not null default 'relevance',
  time_filter text not null default 'all',
  is_active boolean default true,
  last_checked_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table reddit_monitors disable row level security;
create index if not exists idx_reddit_monitors_active on reddit_monitors(is_active) where is_active = true;

-- ============================================================
-- 7. Reddit Monitor Posts (discovered posts)
-- ============================================================
create table if not exists reddit_monitor_posts (
  id uuid default gen_random_uuid() primary key,
  monitor_id uuid not null references reddit_monitors(id) on delete cascade,
  reddit_post_id text not null,
  title text not null,
  body text,
  subreddit text not null,
  author text,
  score integer default 0,
  url text,
  discovered_at timestamp with time zone default now(),
  unique (monitor_id, reddit_post_id)
);

alter table reddit_monitor_posts disable row level security;
create index if not exists idx_reddit_monitor_posts_monitor on reddit_monitor_posts(monitor_id);

-- ============================================================
-- 8. Reddit Generated Posts
-- ============================================================
create table if not exists reddit_generated_posts (
  id uuid default gen_random_uuid() primary key,
  subreddit_id uuid not null references reddit_subreddits(id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'in_review'
    check (status in ('in_review', 'approved', 'rejected')),
  input_mode text not null
    check (input_mode in ('raw_idea', 'manual_reference', 'scraping_command')),
  input_content text,
  identity_id uuid references reddit_identities(id) on delete set null,
  tone_id uuid references reddit_tones(id) on delete set null,
  version_number integer default 1,
  feedback text,
  created_at timestamp with time zone default now(),
  approved_at timestamp with time zone
);

alter table reddit_generated_posts disable row level security;
create index if not exists idx_reddit_generated_posts_subreddit on reddit_generated_posts(subreddit_id);

-- ============================================================
-- 9. Reddit Comment Templates
-- ============================================================
create table if not exists reddit_comment_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  template_text text not null,
  created_at timestamp with time zone default now()
);

alter table reddit_comment_templates disable row level security;

-- ============================================================
-- 10. Reddit Global Prompt
-- ============================================================
create table if not exists reddit_global_prompt (
  id uuid default gen_random_uuid() primary key,
  system_prompt text not null,
  is_active boolean default false,
  updated_at timestamp with time zone default now()
);

alter table reddit_global_prompt disable row level security;

-- ============================================================
-- Settings table extension for Reddit services
-- ============================================================
alter table settings
  add column if not exists apify_enabled boolean default false,
  add column if not exists firecrawl_enabled boolean default false,
  add column if not exists tavily_enabled boolean default false,
  add column if not exists reddit_services_config jsonb default '{}';
