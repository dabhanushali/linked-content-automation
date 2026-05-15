import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-subreddits")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params
  const { data, error } = await supabase
    .from("reddit_subreddits")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Subreddit not found" }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-subreddits")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params
  const body = await req.json()

  const allowedFields: Record<string, unknown> = {}
  if (body.active_tone_id !== undefined) allowedFields.active_tone_id = body.active_tone_id
  if (body.active_identity_id !== undefined) allowedFields.active_identity_id = body.active_identity_id
  if (body.display_name !== undefined) allowedFields.display_name = body.display_name

  const { data, error } = await supabase
    .from("reddit_subreddits")
    .update(allowedFields)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: "Failed to update subreddit" }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-subreddits")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params

  // Cascade delete is handled by DB constraint (ON DELETE CASCADE for generated posts)
  const { error } = await supabase
    .from("reddit_subreddits")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: "Failed to delete subreddit" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
