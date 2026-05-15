import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function PATCH(
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
  const body = await req.json()

  // Only allow updating specific fields
  const allowedFields: Record<string, unknown> = {}
  if (typeof body.is_active === "boolean") allowedFields.is_active = body.is_active
  if (typeof body.keyword === "string") allowedFields.keyword = body.keyword.trim()
  if (typeof body.check_interval_minutes === "number") {
    allowedFields.check_interval_minutes = Math.max(1, Math.min(1440, body.check_interval_minutes))
  }
  if (typeof body.service === "string") {
    const validServices = ["reddit_api", "firecrawl", "tavily"]
    if (validServices.includes(body.service)) allowedFields.service = body.service
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("reddit_monitors")
    .update(allowedFields)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Monitor update error:", error)
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
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

  const { error } = await supabase
    .from("reddit_monitors")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Monitor delete error:", error)
    return NextResponse.json({ error: "Failed to delete monitor" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
