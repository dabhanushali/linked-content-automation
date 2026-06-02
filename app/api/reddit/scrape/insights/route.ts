import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { resolveProvider, generateRedditInsights, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"
import { ScrapedPost } from "@/lib/reddit/types"

export async function GET(req: NextRequest) {
  // Rate limit: 20 req/min for insights
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-scrape-insights"), 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const runId = searchParams.get("runId")
    const force = searchParams.get("force") === "true"

    if (!runId) {
      return NextResponse.json(
        { error: "runId query parameter is required" },
        { status: 400 }
      )
    }

    // 1. Fetch the scrape run from database
    const { data: run, error: fetchError } = await supabase
      .from("reddit_scrape_runs")
      .select("*")
      .eq("id", runId)
      .single()

    if (fetchError || !run) {
      return NextResponse.json(
        { error: "Scrape run not found" },
        { status: 404 }
      )
    }

    // 2. Return cached insights if available and not forced
    if (run.insights_json && !force) {
      return NextResponse.json({ insights: run.insights_json })
    }

    // 3. Parse posts from results_json
    let posts: ScrapedPost[] = []
    if (run.results_json) {
      try {
        posts = JSON.parse(run.results_json)
      } catch (err) {
        console.error("[Reddit Insights] Failed to parse results_json:", err)
      }
    }

    if (posts.length === 0) {
      return NextResponse.json(
        { error: "No posts in this scrape run to analyze." },
        { status: 400 }
      )
    }

    // 4. Resolve AI provider
    const settings = await getSettings()
    const provider = resolveProvider(settings?.ai_provider as AIProvider)

    // 5. Generate insights
    console.log(`[Reddit Insights] Generating insights using ${provider} for run ${runId} with ${posts.length} posts`)
    const insights = await generateRedditInsights(posts, provider)

    // 6. Update database record with fresh insights
    const { error: updateError } = await supabase
      .from("reddit_scrape_runs")
      .update({ insights_json: insights })
      .eq("id", runId)

    if (updateError) {
      console.error("[Reddit Insights] Failed to cache insights in database:", updateError)
    }

    return NextResponse.json({ insights })
  } catch (error) {
    console.error("[Reddit Insights] Error generating insights:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
