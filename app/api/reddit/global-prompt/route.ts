import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-global-prompt")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  // Get the active prompt (or the most recent one)
  const { data, error } = await supabase
    .from("reddit_global_prompt")
    .select("*")
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: "Failed to load global prompt" }, { status: 500 })
  }

  return NextResponse.json(data || null)
}

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-global-prompt")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const body = await req.json()
  const { system_prompt, is_active } = body

  if (!system_prompt || typeof system_prompt !== "string") {
    return NextResponse.json({ error: "system_prompt is required" }, { status: 400 })
  }

  // Enforce singleton active invariant: deactivate all others if this is active
  if (is_active) {
    await supabase
      .from("reddit_global_prompt")
      .update({ is_active: false })
      .eq("is_active", true)
  }

  // Check if a prompt already exists
  const { data: existing } = await supabase
    .from("reddit_global_prompt")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single()

  let data
  let error

  if (existing) {
    // Update existing prompt
    const result = await supabase
      .from("reddit_global_prompt")
      .update({
        system_prompt: system_prompt.trim(),
        is_active: is_active ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single()
    data = result.data
    error = result.error
  } else {
    // Create new prompt
    const result = await supabase
      .from("reddit_global_prompt")
      .insert({
        system_prompt: system_prompt.trim(),
        is_active: is_active ?? false,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()
    data = result.data
    error = result.error
  }

  if (error) {
    console.error("Global prompt save error:", error)
    return NextResponse.json({ error: "Failed to save global prompt" }, { status: 500 })
  }

  return NextResponse.json(data)
}
