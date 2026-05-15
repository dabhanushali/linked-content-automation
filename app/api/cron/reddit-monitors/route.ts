import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { scrapeReddit } from "@/lib/reddit/scraping"
import { ScrapingProvider } from "@/lib/reddit/types"

/**
 * Cron endpoint for checking active Reddit monitors.
 * Secured with CRON_SECRET header (same pattern as /api/cron/trends).
 * 
 * Queries all active monitors where last_checked_at + check_interval_minutes < now,
 * executes a check for each due monitor, and updates last_checked_at.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Fetch all active monitors
  const { data: monitors, error } = await supabase
    .from("reddit_monitors")
    .select("*")
    .eq("is_active", true)

  if (error) {
    console.error("Cron: Failed to fetch monitors:", error)
    return NextResponse.json({ error: "Failed to fetch monitors" }, { status: 500 })
  }

  if (!monitors || monitors.length === 0) {
    return NextResponse.json({ message: "No active monitors", checked: 0 })
  }

  const now = Date.now()
  const results: { id: string; subreddit: string; status: string; new_posts: number }[] = []

  for (const monitor of monitors) {
    // Check if monitor is due for a check
    const lastChecked = monitor.last_checked_at
      ? new Date(monitor.last_checked_at).getTime()
      : 0
    const intervalMs = (monitor.check_interval_minutes || 60) * 60 * 1000
    const isDue = now - lastChecked >= intervalMs

    if (!isDue) continue

    try {
      // Scrape using the monitor's configured service
      const posts = await scrapeReddit({
        subreddit: monitor.subreddit,
        keywords: monitor.keyword,
        maxResults: 25,
        sort: monitor.sort || "relevance",
        timeFilter: monitor.time_filter || "all",
        provider: (monitor.service || "reddit_api") as ScrapingProvider,
      })

      // Get existing post IDs for deduplication
      const { data: existingPosts } = await supabase
        .from("reddit_monitor_posts")
        .select("reddit_post_id")
        .eq("monitor_id", monitor.id)

      const existingIds = new Set(
        (existingPosts || []).map((p: { reddit_post_id: string }) => p.reddit_post_id)
      )

      // Filter posts by keyword — skip if search API was used (it already filtered)
      const keyword = monitor.keyword.toLowerCase().trim()
      const usedSearchEndpoint = !!monitor.keyword
      let filteredPosts = usedSearchEndpoint
        ? posts
        : posts.filter((p) => {
            const text = `${p.title} ${p.selftext}`.toLowerCase()
            return text.includes(keyword)
          })

      // Filter by time window (for hot/rising feeds where Reddit API doesn't enforce time)
      const timeFilter = monitor.time_filter || "all"
      if (timeFilter !== "all") {
        const now = Date.now() / 1000
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
            if (!p.created_utc) return true
            return (now - p.created_utc) <= maxAge
          })
        }
      }

      // Filter to only new posts
      const newPosts = filteredPosts.filter((p) => !existingIds.has(p.reddit_id))

      // Insert new posts
      if (newPosts.length > 0) {
        const insertData = newPosts.map((p) => ({
          monitor_id: monitor.id,
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
        .eq("id", monitor.id)

      results.push({
        id: monitor.id,
        subreddit: monitor.subreddit,
        status: "success",
        new_posts: newPosts.length,
      })
    } catch (e) {
      console.error(`Cron: Monitor ${monitor.id} (r/${monitor.subreddit}) failed:`, e)
      results.push({
        id: monitor.id,
        subreddit: monitor.subreddit,
        status: "failed",
        new_posts: 0,
      })
      // Continue to next monitor — don't stop on individual failures
    }
  }

  return NextResponse.json({
    message: "Monitor checks complete",
    checked: results.length,
    results,
  })
}
