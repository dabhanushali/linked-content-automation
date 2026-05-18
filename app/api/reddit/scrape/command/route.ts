import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { parseCommand, toParseIntent } from "@/lib/reddit/command-parser"
import { scrapeReddit } from "@/lib/reddit/scraping"
import { ScrapingProvider } from "@/lib/reddit/types"

export async function POST(req: NextRequest) {
  // Rate limit: 10 req/min for scrape commands
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-scrape-command"), 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const { command, provider = "reddit_api" } = body as {
      command: string
      provider?: ScrapingProvider
    }

    if (!command || typeof command !== "string" || command.trim().length < 2) {
      return NextResponse.json(
        { error: "command must be at least 2 characters" },
        { status: 400 }
      )
    }

    // Parse the natural language command
    const parsed = parseCommand(command.trim())
    const parsedIntent = toParseIntent(parsed)
    console.log("[SCRAPE DEBUG]", {
      raw_command: command.trim(),
      extracted_keywords: parsed.keywords,
      sort: parsed.sort,
      timeFilter: parsed.timeFilter,
      maxResults: parsed.maxResults,
      subreddit: parsed.subreddit,
      provider,
      final_url: parsed.subreddit
        ? `https://www.reddit.com/r/${parsed.subreddit}/search.json?q=${encodeURIComponent(parsed.keywords)}&restrict_sr=on&limit=${parsed.maxResults}&sort=${parsed.sort}&t=${parsed.timeFilter}`
        : `https://www.reddit.com/search.json?q=${encodeURIComponent(parsed.keywords)}&limit=${parsed.maxResults}&sort=${parsed.sort}&t=${parsed.timeFilter}`,
    })

    // Create scrape run record with pending status
    const { data: run, error: insertError } = await supabase
      .from("reddit_scrape_runs")
      .insert({
        command_text: command.trim(),
        parsed_intent: parsedIntent,
        actor_used: provider,
        result_count: 0,
        status: "pending",
      })
      .select()
      .single()

    if (insertError || !run) {
      return NextResponse.json(
        { error: "Failed to create scrape run record" },
        { status: 500 }
      )
    }

    // Update status to running
    await supabase
      .from("reddit_scrape_runs")
      .update({ status: "running" })
      .eq("id", run.id)

    // Execute the scrape
    try {
      const posts = await scrapeReddit({
        subreddit: parsed.subreddit || undefined,
        keywords: parsed.keywords,
        maxResults: parsed.maxResults,
        sort: parsed.sort,
        timeFilter: parsed.timeFilter,
        provider,
      })

      // Update run with results
      await supabase
        .from("reddit_scrape_runs")
        .update({
          status: "complete",
          result_count: posts.length,
          results_json: JSON.stringify(posts),
        })
        .eq("id", run.id)

      return NextResponse.json({
        run_id: run.id,
        status: "complete",
        parsed_intent: parsedIntent,
        provider,
        result_count: posts.length,
        results: posts,
      })
    } catch (scrapeError) {
      // Update run as failed
      await supabase
        .from("reddit_scrape_runs")
        .update({ status: "failed" })
        .eq("id", run.id)

      return NextResponse.json(
        {
          run_id: run.id,
          status: "failed",
          error: scrapeError instanceof Error ? scrapeError.message : "Scrape failed",
        },
        { status: 502 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
