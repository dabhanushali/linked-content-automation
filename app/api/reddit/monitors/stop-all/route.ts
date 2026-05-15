import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-monitors")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { error } = await supabase
    .from("reddit_monitors")
    .update({ is_active: false })
    .eq("is_active", true)

  if (error) {
    console.error("Stop all monitors error:", error)
    return NextResponse.json({ error: "Failed to stop monitors" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
