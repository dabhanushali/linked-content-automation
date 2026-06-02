import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  // Rate limit: 60 req/min for viewing
  const rl = checkRateLimit(getRateLimitKey(req, "geo-keyword-list"), 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { data: keywords, error } = await supabase
      .from("geo_keywords")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[GEO Keyword List] Database error:", error)
      return NextResponse.json(
        { error: "Failed to fetch keyword scans history" },
        { status: 500 }
      )
    }

    return NextResponse.json({ keywords: keywords || [] })
  } catch (error) {
    console.error("[GEO Keyword List] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "id is required to delete" }, { status: 400 })
    }

    const { error } = await supabase
      .from("geo_keywords")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: "Failed to delete keyword" }, { status: 500 })
    }

    return NextResponse.json({ message: "Keyword scan deleted successfully" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
