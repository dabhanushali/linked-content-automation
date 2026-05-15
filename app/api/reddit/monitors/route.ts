import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-monitors")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { data, error } = await supabase
    .from("reddit_monitors")
    .select("*, reddit_monitor_posts(count)")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Monitors list error:", error)
    return NextResponse.json({ error: "Failed to load monitors" }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-monitors")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const body = await req.json()
  const { subreddit, keyword, check_interval_minutes, service, sort, time_filter } = body

  if (!subreddit || typeof subreddit !== "string") {
    return NextResponse.json({ error: "Subreddit is required" }, { status: 400 })
  }
  if (!keyword || typeof keyword !== "string") {
    return NextResponse.json({ error: "Keyword is required" }, { status: 400 })
  }

  const validServices = ["reddit_api", "firecrawl", "tavily"]
  const selectedService = validServices.includes(service) ? service : "reddit_api"
  const interval = Math.max(1, Math.min(1440, Number(check_interval_minutes) || 60))

  const validSorts = ["relevance", "hot", "top", "new"]
  const selectedSort = validSorts.includes(sort) ? sort : "relevance"

  const validTimeFilters = ["hour", "day", "week", "month", "year", "all"]
  const selectedTimeFilter = validTimeFilters.includes(time_filter) ? time_filter : "all"

  const { data, error } = await supabase
    .from("reddit_monitors")
    .insert({
      subreddit: subreddit.trim().replace(/^r\//, ""),
      keyword: keyword.trim(),
      check_interval_minutes: interval,
      service: selectedService,
      sort: selectedSort,
      time_filter: selectedTimeFilter,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    console.error("Monitor create error:", error)
    return NextResponse.json({ error: "Failed to create monitor" }, { status: 500 })
  }

  return NextResponse.json(data)
}
