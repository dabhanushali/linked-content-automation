import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { scrapeReddit } from "@/lib/reddit/scraping"
import { ScrapingProvider } from "@/lib/reddit/types"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-monitor-check")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 5, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params

  // Fetch the monitor
  const { data: monitor, error: monitorError } = await supabase
    .from("reddit_monitors")
    .select("*")
    .eq("id", id)
    .single()

  if (monitorError || !monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 })
  }

  try {
    // Scrape using the monitor's configured service
    // Use the keyword as the search query to find relevant posts
    const posts = await scrapeReddit({
      subreddit: monitor.subreddit,
      keywords: monitor.keyword,
      maxResults: 25,
      sort: monitor.sort || "relevance",
      timeFilter: monitor.time_filter || "all",
      provider: monitor.service as ScrapingProvider,
    })

    // Filter posts by keyword (case-insensitive phrase match in title or selftext)
    // Only apply local keyword filter when using feed endpoints (hot/new/rising without search)
    // When search API is used (keywords provided), Reddit already filtered by keyword
    const keyword = monitor.keyword.toLowerCase().trim()
    const usedSearchEndpoint = !!monitor.keyword
    let filteredPosts = usedSearchEndpoint
      ? posts // Search API already filtered by keyword
      : posts.filter((p) => {
          const text = `${p.title} ${p.selftext}`.toLowerCase()
          return text.includes(keyword)
        })

    // Filter by time window (for hot/rising feeds where Reddit API doesn't enforce time)
    const timeFilter = monitor.time_filter || "all"
    if (timeFilter !== "all") {
      const now = Date.now() / 1000 // current time in seconds
      const timeWindows: Record<string, number> = {
        hour: 3600,
        day: 86400,
        week: 604800,
        month: 2592000,
        year: 31536000,
      }
      const maxAge = timeWindows[timeFilter] || 0
      if (maxAge > 0) {
        filteredPosts = filteredPosts.filter((p) => {
          if (!p.created_utc) return true // keep if no timestamp
          return (now - p.created_utc) <= maxAge
        })
      }
    }

    // Get existing post IDs for this monitor to deduplicate
    const { data: existingPosts } = await supabase
      .from("reddit_monitor_posts")
      .select("reddit_post_id")
      .eq("monitor_id", id)

    const existingIds = new Set(
      (existingPosts || []).map((p: { reddit_post_id: string }) => p.reddit_post_id)
    )

    // Filter to only new posts
    const newPosts = filteredPosts.filter((p) => !existingIds.has(p.reddit_id))

    // Insert new posts
    if (newPosts.length > 0) {
      const insertData = newPosts.map((p) => ({
        monitor_id: id,
        reddit_post_id: p.reddit_id,
        title: p.title,
        body: p.selftext,
        subreddit: p.subreddit,
        author: p.author,
        score: p.score,
        url: p.permalink.startsWith("http")
          ? p.permalink
          : `https://www.reddit.com${p.permalink}`,
      }))

      await supabase.from("reddit_monitor_posts").upsert(insertData, {
        onConflict: "monitor_id,reddit_post_id",
        ignoreDuplicates: true,
      })
    }

    // Update last_checked_at
    await supabase
      .from("reddit_monitors")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", id)

    return NextResponse.json({
      success: true,
      new_posts: newPosts.length,
      total_scraped: posts.length,
    })
  } catch (e) {
    console.error(`Monitor check failed for ${id}:`, e)
    return NextResponse.json(
      { error: `Check failed: ${e instanceof Error ? e.message : "Unknown error"}` },
      { status: 500 }
    )
  }
}
