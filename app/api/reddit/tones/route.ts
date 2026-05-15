import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

const PRESET_TONES = [
  { name: "Professional", description: "Clear, authoritative, and knowledgeable. Uses industry terminology naturally. Focuses on providing value and actionable insights.", is_preset: true },
  { name: "Sarcastic & Witty", description: "Sharp humor with a point. Uses irony and clever observations. Never mean-spirited but always entertaining.", is_preset: true },
  { name: "Storyteller", description: "Narrative-driven responses. Opens with a hook, builds tension, delivers a payoff. Uses personal anecdotes and vivid details.", is_preset: true },
  { name: "Controversial", description: "Takes strong positions. Challenges conventional wisdom. Backs up hot takes with evidence. Invites debate.", is_preset: true },
]

async function seedPresetsIfNeeded() {
  const { data: existing } = await supabase
    .from("reddit_tones")
    .select("id")
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase
    .from("reddit_tones")
    .insert(PRESET_TONES)
}

export async function GET(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-tones")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  // Seed presets on first GET
  await seedPresetsIfNeeded()

  const { data, error } = await supabase
    .from("reddit_tones")
    .select("*")
    .order("is_preset", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: "Failed to load tones" }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-tones")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const body = await req.json()
  const { name, description } = body

  if (!name || !description) {
    return NextResponse.json({ error: "Name and description are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("reddit_tones")
    .insert({
      name: name.trim(),
      description: description.trim(),
      is_preset: false,
    })
    .select()
    .single()

  if (error) {
    console.error("Tone create error:", error)
    return NextResponse.json({ error: "Failed to create tone" }, { status: 500 })
  }

  return NextResponse.json(data)
}
