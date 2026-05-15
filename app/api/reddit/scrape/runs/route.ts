import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  // Rate limit: 30 req/min for CRUD
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-scrape-runs"), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { data: runs, error } = await supabase
      .from("reddit_scrape_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch scrape runs" },
        { status: 500 }
      )
    }

    return NextResponse.json({ runs: runs || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  // Rate limit: 30 req/min for CRUD
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-scrape-runs"), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (id) {
      // Delete single run by ID
      const { error } = await supabase
        .from("reddit_scrape_runs")
        .delete()
        .eq("id", id)

      if (error) {
        return NextResponse.json({ error: "Failed to delete run" }, { status: 500 })
      }
      return NextResponse.json({ message: "Run deleted" })
    }

    // Delete all runs
    const { error } = await supabase
      .from("reddit_scrape_runs")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")

    if (error) {
      return NextResponse.json(
        { error: "Failed to clear scrape history" },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: "Scrape history cleared" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
