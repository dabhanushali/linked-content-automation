import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { fetchSubredditRules } from "@/lib/reddit/scraping"
import { resolveProvider, cleanSubredditRules, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"

export async function GET(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-subreddits")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { data, error } = await supabase
    .from("reddit_subreddits")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: "Failed to load subreddits" }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-subreddits")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const body = await req.json()
  const { name } = body

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Subreddit name is required" }, { status: 400 })
  }

  const cleanName = name.trim().replace(/^r\//, "")
  if (!cleanName) {
    return NextResponse.json({ error: "Invalid subreddit name" }, { status: 400 })
  }

  // Auto-fetch rules
  let rulesRaw: string | null = null
  let rulesClean: string | null = null

  try {
    rulesRaw = await fetchSubredditRules(cleanName)
    if (rulesRaw) {
      const settings = await getSettings()
      const provider = resolveProvider(settings?.ai_provider as AIProvider)
      rulesClean = await cleanSubredditRules(rulesRaw, provider)
    }
  } catch (e) {
    console.warn(`Failed to fetch/clean rules for r/${cleanName}:`, e)
  }

  const { data, error } = await supabase
    .from("reddit_subreddits")
    .insert({
      name: cleanName,
      display_name: cleanName,
      rules_raw: rulesRaw,
      rules_clean: rulesClean,
      last_scraped_at: rulesRaw ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) {
    console.error("Subreddit create error:", error)
    return NextResponse.json({ error: "Failed to create subreddit" }, { status: 500 })
  }

  return NextResponse.json(data)
}
