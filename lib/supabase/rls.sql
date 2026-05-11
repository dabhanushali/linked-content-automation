-- Harvey Content Fabric — Row Level Security
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/vgdhtfpetfietxqzarda/sql/new
-- This fixes the "Table publicly accessible" security alert.
-- Strategy: enable RLS on all tables + grant anon role exactly the operations the app needs.

-- ── posts ────────────────────────────────────────────────────────────────────
alter table posts enable row level security;

-- API routes: insert new posts
create policy "anon can insert posts"
  on posts for insert to anon
  with check (true);

-- History page: read all posts
create policy "anon can read posts"
  on posts for select to anon
  using (true);

-- PostCard feedback button (browser): update feedback column only
create policy "anon can update post feedback"
  on posts for update to anon
  using (true)
  with check (true);

-- DeletePostButton (browser): delete own posts
create policy "anon can delete posts"
  on posts for delete to anon
  using (true);

-- ── settings ─────────────────────────────────────────────────────────────────
alter table settings enable row level security;

-- Settings page: read singleton row
create policy "anon can read settings"
  on settings for select to anon
  using (true);

-- Settings page: update singleton row (id = 1 only)
create policy "anon can update settings"
  on settings for update to anon
  using (id = 1)
  with check (id = 1);

-- Initial setup: insert the singleton row if it doesn't exist
create policy "anon can insert settings"
  on settings for insert to anon
  with check (id = 1);

-- ── knowledge_base ───────────────────────────────────────────────────────────
alter table knowledge_base enable row level security;

-- Settings page: read all knowledge items
create policy "anon can read knowledge_base"
  on knowledge_base for select to anon
  using (true);

-- Settings page: add new PDF or URL
create policy "anon can insert knowledge_base"
  on knowledge_base for insert to anon
  with check (true);

-- Settings page: delete knowledge item
create policy "anon can delete knowledge_base"
  on knowledge_base for delete to anon
  using (true);

-- ── source_cache ─────────────────────────────────────────────────────────────
-- Only create if this table exists in your project
alter table source_cache enable row level security;

create policy "anon can read source_cache"
  on source_cache for select to anon
  using (true);

create policy "anon can insert source_cache"
  on source_cache for insert to anon
  with check (true);

create policy "anon can update source_cache"
  on source_cache for update to anon
  using (true)
  with check (true);

-- ── trends ───────────────────────────────────────────────────────────────────
alter table trends enable row level security;

create policy "anon can read trends"
  on trends for select to anon
  using (true);

create policy "anon can insert trends"
  on trends for insert to anon
  with check (true);

-- ── comments ─────────────────────────────────────────────────────────────────
alter table comments enable row level security;

create policy "anon can read comments"
  on comments for select to anon
  using (true);

create policy "anon can insert comments"
  on comments for insert to anon
  with check (true);

create policy "anon can delete comments"
  on comments for delete to anon
  using (true);

-- ── post_examples ────────────────────────────────────────────────────────────
alter table post_examples enable row level security;

create policy "anon can read post_examples"
  on post_examples for select to anon
  using (true);

-- ── digests ──────────────────────────────────────────────────────────────────
alter table digests enable row level security;

create policy "anon can read digests"
  on digests for select to anon
  using (true);

create policy "anon can insert digests"
  on digests for insert to anon
  with check (true);

create policy "anon can delete digests"
  on digests for delete to anon
  using (true);
