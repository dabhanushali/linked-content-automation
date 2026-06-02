// Reddit Integration — Core TypeScript Types

export interface RedditSubreddit {
  id: string
  name: string
  display_name: string
  rules_raw: string | null
  rules_clean: string | null
  last_scraped_at: string | null
  active_tone_id: string | null
  active_identity_id: string | null
  created_at: string
}

export interface RedditIdentity {
  id: string
  name: string
  identity_text: string
  goals_text: string
  rules_text: string
  is_default: boolean
  created_at: string
}

export interface RedditTone {
  id: string
  name: string
  description: string
  is_preset: boolean
  created_at: string
}

export interface EngagementItem {
  id: string
  title: string
  body: string | null
  subreddit: string | null
  author: string | null
  score: number
  comment_count: number
  url: string | null
  note: string | null
  tags: string[]
  scrape_run_id: string | null
  created_at: string
}

export interface ParsedIntent {
  subreddit: string | null
  keywords: string
  max_results: number
  sort: "hot" | "new" | "top" | "rising" | "relevance"
  time_filter: "day" | "week" | "month" | "year" | "all"
  is_reddit_specific: boolean
}

export interface RedditTopicInsight {
  id: string
  name: string
  description: string
  motiveIntent: string
  sentiment: string
  postIds: string[]
}

export interface RedditInsights {
  topics: RedditTopicInsight[]
  generalTakeaways: string[]
}

export interface ScrapeRun {
  id: string
  command_text: string
  parsed_intent: ParsedIntent
  actor_used: string | null
  result_count: number
  results_json: string | null
  insights_json: RedditInsights | null
  status: "pending" | "running" | "complete" | "failed"
  created_at: string
}

export interface ScrapedPost {
  reddit_id: string
  title: string
  author: string
  subreddit: string
  score: number
  comment_count: number
  permalink: string
  selftext: string // truncated to 2000 chars
  upvote_ratio: number
  created_utc: number
}

export interface RedditMonitor {
  id: string
  subreddit: string
  keyword: string
  check_interval_minutes: number
  service: ScrapingProvider
  is_active: boolean
  last_checked_at: string | null
  created_at: string
}

export interface MonitorPost {
  id: string
  monitor_id: string
  reddit_post_id: string
  title: string
  body: string | null
  subreddit: string
  author: string | null
  score: number
  url: string | null
  discovered_at: string
}

export interface RedditGeneratedPost {
  id: string
  subreddit_id: string
  title: string
  body: string
  status: "in_review" | "approved" | "rejected"
  input_mode: "raw_idea" | "manual_reference" | "scraping_command"
  input_content: string | null
  identity_id: string | null
  tone_id: string | null
  version_number: number
  feedback: string | null
  created_at: string
  approved_at: string | null
}

export interface CommentTemplate {
  id: string
  name: string
  template_text: string
  created_at: string
}

export interface GlobalPrompt {
  id: string
  system_prompt: string
  is_active: boolean
  updated_at: string
}

// Scraping provider type used across the feature
export type ScrapingProvider = "reddit_api" | "apify" | "firecrawl" | "tavily" | "puppeteer"

// Comment archetype options
export type CommentArchetype =
  | "detailed_helper"
  | "tool_roundup"
  | "storyteller"
  | "myth_buster"
  | "mini_guide"
  | "auto"

// Comment size options
export type CommentSize = "short" | "medium" | "long"

// Input modes for post generation
export type InputMode = "raw_idea" | "manual_reference" | "scraping_command"

// ============================================================
// GEO & Content Automation Platform Types
// ============================================================

export interface GeoKeyword {
  id: string
  phrase: string
  status: "scanning" | "completed" | "failed"
  ai_questions_json?: Array<{
    question: string
    search_intent: "informational" | "commercial" | "navigational"
    motive_summary: string
  }> | null
  created_at: string
}

export interface GeoRedditPost {
  id: string
  keyword_id: string
  title: string
  url: string | null
  subreddit: string | null
  author: string | null
  upvotes: number
  num_comments: number
  created_utc: number
  selftext: string | null
  created_at: string
}

export interface GeoCluster {
  id: string
  keyword_id: string
  cluster_name: string
  core_intent: "informational" | "commercial" | "transactional"
  summary: string
  total_posts: number
  total_comments: number
  hotness_score: number
  post_ids: string[]
}

export interface GeoLlmSuggestion {
  id: string
  keyword_id: string
  source: "gemini" | "chatgpt" | "claude" | "perplexity"
  topic_title: string
  suggested_angle: string
  priority: "high" | "medium" | "low"
}

export interface GeoWebsiteIndex {
  id: string
  keyword_id: string
  url: string
  title: string
  meta_description: string | null
  matching_cluster_id: string | null
  coverage_status: "uncovered" | "needs_optimization" | "covered"
  scanned_at: string
}

