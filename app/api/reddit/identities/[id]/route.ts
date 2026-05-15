import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-identities")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params
  const body = await req.json()

  // If marking as default, unmark any existing default first
  if (body.is_default) {
    await supabase
      .from("reddit_identities")
      .update({ is_default: false })
      .eq("is_default", true)
  }

  const allowedFields: Record<string, unknown> = {}
  if (body.name !== undefined) allowedFields.name = body.name
  if (body.identity_text !== undefined) allowedFields.identity_text = body.identity_text
  if (body.goals_text !== undefined) allowedFields.goals_text = body.goals_text
  if (body.rules_text !== undefined) allowedFields.rules_text = body.rules_text
  if (body.is_default !== undefined) allowedFields.is_default = body.is_default

  const { data, error } = await supabase
    .from("reddit_identities")
    .update(allowedFields)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: "Failed to update identity" }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlKey = getRateLimitKey(req, "reddit-identities")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { id } = await params

  // Set active_identity_id to null on any referencing subreddits
  await supabase
    .from("reddit_subreddits")
    .update({ active_identity_id: null })
    .eq("active_identity_id", id)

  const { error } = await supabase
    .from("reddit_identities")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: "Failed to delete identity" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
