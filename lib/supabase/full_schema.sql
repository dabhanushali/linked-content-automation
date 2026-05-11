-- Harvey Content Fabric — Full Supabase Schema
-- Run this in your Supabase SQL Editor

-- 1. POSTS
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  character_count integer not null,
  trend_title text not null,
  trend_summary text,
  language text not null default 'EN',
  tone text not null,
  feedback text check (feedback in ('up', 'down')),
  created_at timestamp with time zone default now()
);

-- 2. TRENDS
create table if not exists trends (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  summary text,
  source text,
  relevance_score integer,
  velocity text,
  upvotes integer default 0,
  comments integer default 0,
  source_url text,
  found_at timestamp with time zone default now()
);

-- 3. SETTINGS (Singleton)
create table if not exists settings (
  id integer primary key default 1,
  harvey_profile text,
  icp text,
  voice_rules text,
  topic_clusters text[],
  competitors text[],
  ai_provider text check (ai_provider in ('anthropic', 'openai')),
  trend_sources text[],
  trend_refresh_time text,
  subreddits text[],
  default_language text default 'EN',
  updated_at timestamp with time zone default now(),
  constraint singleton_id check (id = 1)
);

-- Insert initial settings if not exists
insert into settings (id, harvey_profile, icp, voice_rules, ai_provider)
values (1, 'Default Harvey Profile', 'B2B Sales Teams', 'Keep it professional and punchy', 'openai')
on conflict (id) do nothing;

-- 4. KNOWLEDGE BASE
create table if not exists knowledge_base (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text check (type in ('pdf', 'url')),
  source_url text,
  content text not null,
  created_at timestamp with time zone default now()
);

-- 5. COMMENTS
create table if not exists comments (
  id uuid default gen_random_uuid() primary key,
  platform text check (platform in ('reddit', 'linkedin')),
  archetype text,
  original_content text,
  generated_comment text,
  word_count integer,
  trend_title text,
  created_at timestamp with time zone default now()
);

-- 6. SOURCE CACHE
create table if not exists source_cache (
  url text primary key,
  content text,
  content_hash text,
  scraped_at timestamp with time zone default now()
);

-- 7. POST EXAMPLES
create table if not exists post_examples (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  hook_text text,
  hook_type text,
  tone text,
  format text,
  char_count integer,
  hashtag_count integer,
  reactions integer default 0,
  comments integer default 0,
  reposts integer default 0,
  views integer default 0,
  media_type text,
  source_url text,
  engagement_tier text,
  why_it_works text,
  topic_tags text[],
  source text check (source in ('own', 'curated')),
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- 8. DIGESTS
create table if not exists digests (
  id uuid default gen_random_uuid() primary key,
  week_range text not null,
  generated_at timestamp with time zone default now(),
  web_count integer,
  reddit_count integer,
  headline text,
  digest_json jsonb not null,
  created_at timestamp with time zone default now()
);

-- RLS enablement is handled in lib/supabase/rls.sql
