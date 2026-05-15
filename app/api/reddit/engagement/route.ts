import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  // Rate limit: 30 req/min for CRUD
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-engagement"), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const subredditFilter = searchParams.get("subreddit")
    const tagsFilter = searchParams.get("tags")
    const dateFrom = searchParams.get("date_from")
    const dateTo = searchParams.get("date_to")

    let query = supabase
      .from("engagement_library")
      .select("*")
      .order("score", { ascending: false })

    if (subredditFilter) {
      query = query.eq("subreddit", subredditFilter)
    }

    if (tagsFilter) {
      // Filter by tags (contains any of the provided tags)
      const tags = tagsFilter.split(",").map((t) => t.trim())
      query = query.overlaps("tags", tags)
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom)
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo)
    }

    const { data: items, error } = await query

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch engagement items" },
        { status: 500 }
      )
    }

    return NextResponse.json({ items: items || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 30 req/min for CRUD
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-engagement"), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const {
      title,
      body: postBody,
      subreddit,
      author,
      score = 0,
      comment_count = 0,
      url,
      note,
      tags = [],
      scrape_run_id,
    } = body

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      )
    }

    const { data: item, error } = await supabase
      .from("engagement_library")
      .insert({
        title,
        body: postBody || null,
        subreddit: subreddit || null,
        author: author || null,
        score,
        comment_count,
        url: url || null,
        note: note || null,
        tags: Array.isArray(tags) ? tags : [],
        scrape_run_id: scrape_run_id || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: "Failed to save engagement item" },
        { status: 500 }
      )
    }

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
