import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-monitors")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params

  const { data, error } = await supabase
    .from("reddit_monitor_posts")
    .select("*")
    .eq("monitor_id", id)
    .order("discovered_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("Monitor posts fetch error:", error)
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
