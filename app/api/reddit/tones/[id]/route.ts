import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-tones")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params

  // Check if it's a preset tone (cannot delete presets)
  const { data: tone } = await supabase
    .from("reddit_tones")
    .select("is_preset")
    .eq("id", id)
    .single()

  if (tone?.is_preset) {
    return NextResponse.json({ error: "Cannot delete preset tones" }, { status: 400 })
  }

  const { error } = await supabase
    .from("reddit_tones")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: "Failed to delete tone" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
