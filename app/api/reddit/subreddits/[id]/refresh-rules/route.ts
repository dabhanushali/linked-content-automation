import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { fetchSubredditRules } from "@/lib/reddit/scraping"
import { resolveProvider, cleanSubredditRules, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-subreddits-refresh")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params

  // Get the subreddit
  const { data: subreddit, error: fetchError } = await supabase
    .from("reddit_subreddits")
    .select("*")
    .eq("id", id)
    .single()

  if (fetchError || !subreddit) {
    return NextResponse.json({ error: "Subreddit not found" }, { status: 404 })
  }

  // Fetch fresh rules
  let rulesRaw: string | null = null
  let rulesClean: string | null = null

  try {
    rulesRaw = await fetchSubredditRules(subreddit.name)
    if (rulesRaw) {
      const settings = await getSettings()
      const provider = resolveProvider(settings?.ai_provider as AIProvider)
      rulesClean = await cleanSubredditRules(rulesRaw, provider)
    }
  } catch (e) {
    console.warn(`Failed to refresh rules for r/${subreddit.name}:`, e)
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 })
  }

  // Update the subreddit
  const { data, error } = await supabase
    .from("reddit_subreddits")
    .update({
      rules_raw: rulesRaw,
      rules_clean: rulesClean,
      last_scraped_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: "Failed to update subreddit rules" }, { status: 500 })
  }

  return NextResponse.json(data)
}
