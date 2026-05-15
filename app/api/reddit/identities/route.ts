import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-identities")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { data, error } = await supabase
    .from("reddit_identities")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: "Failed to load identities" }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-identities")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const body = await req.json()
  const { name, identity_text, goals_text, rules_text, is_default } = body

  if (!name || !identity_text || !goals_text || !rules_text) {
    return NextResponse.json({ error: "All fields are required: name, identity_text, goals_text, rules_text" }, { status: 400 })
  }

  // If marking as default, unmark any existing default
  if (is_default) {
    await supabase
      .from("reddit_identities")
      .update({ is_default: false })
      .eq("is_default", true)
  }

  const { data, error } = await supabase
    .from("reddit_identities")
    .insert({
      name,
      identity_text,
      goals_text,
      rules_text,
      is_default: is_default || false,
    })
    .select()
    .single()

  if (error) {
    console.error("Identity create error:", error)
    return NextResponse.json({ error: "Failed to create identity" }, { status: 500 })
  }

  return NextResponse.json(data)
}
