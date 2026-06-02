import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  // Rate limit: 60 req/min
  const rl = checkRateLimit(getRateLimitKey(req, "geo-keyword-details"), 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const keywordId = searchParams.get("id")

    if (!keywordId) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      )
    }

    // 1. Fetch keyword
    const { data: keyword, error: keywordError } = await supabase
      .from("geo_keywords")
      .select("*")
      .eq("id", keywordId)
      .single()

    if (keywordError || !keyword) {
      return NextResponse.json(
        { error: "Keyword scan not found" },
        { status: 404 }
      )
    }

    // 2. Fetch raw reddit posts
    const { data: posts } = await supabase
      .from("geo_reddit_posts")
      .select("*")
      .eq("keyword_id", keywordId)
      .order("upvotes", { ascending: false })

    // 3. Fetch clusters
    const { data: clusters } = await supabase
      .from("geo_clusters")
      .select("*")
      .eq("keyword_id", keywordId)
      .order("hotness_score", { ascending: false })

    // 4. Fetch LLM suggestions
    const { data: suggestions } = await supabase
      .from("geo_llm_suggestions")
      .select("*")
      .eq("keyword_id", keywordId)

    // 5. Fetch website audit coverage mapping
    const { data: coverage } = await supabase
      .from("geo_website_index")
      .select("*")
      .eq("keyword_id", keywordId)

    return NextResponse.json({
      keyword,
      posts: posts || [],
      clusters: clusters || [],
      suggestions: suggestions || [],
      coverage: coverage || []
    })

  } catch (error) {
    console.error("[GEO Keyword Details] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
