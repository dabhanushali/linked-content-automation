import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { resolveProvider, generatePosts, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"
import { buildRedditPostPrompt, RedditPromptContext } from "@/lib/reddit/prompt-builder"
import {
  RedditSubreddit,
  RedditIdentity,
  RedditTone,
  GlobalPrompt,
  EngagementItem,
} from "@/lib/reddit/types"

/**
 * Extracts a JSON object with "title" and "body" keys from an AI response string.
 * Handles responses wrapped in markdown code fences or surrounded by other text.
 */
export function extractJson(text: string): { title: string; body: string } | null {
  // Try 1: Direct JSON parse
  try {
    const parsed = JSON.parse(text)
    if (parsed.title && parsed.body) return { title: parsed.title, body: parsed.body }
  } catch {
    // Not pure JSON, continue
  }

  // Try 2: Extract from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      if (parsed.title && parsed.body) return { title: parsed.title, body: parsed.body }
    } catch {
      // Continue to next strategy
    }
  }

  // Try 3: Find first JSON object in text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.title && parsed.body) return { title: parsed.title, body: parsed.body }
    } catch {
      // Continue to next strategy
    }
  }

  // Try 4: Greedy match for nested braces
  const start = text.indexOf("{")
  if (start !== -1) {
    let depth = 0
    let end = -1
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++
      else if (text[i] === "}") {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end !== -1) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1))
        if (parsed.title && parsed.body) return { title: parsed.title, body: parsed.body }
      } catch {
        // All strategies exhausted
      }
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 req/min
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-generate"), 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const {
      subreddit_id,
      input_mode,
      input_content,
      identity_id,
      tone_id,
      engagement_item_ids,
    } = body

    // Validate required fields
    if (!subreddit_id || !input_mode || !input_content) {
      return NextResponse.json(
        { error: "subreddit_id, input_mode, and input_content are required" },
        { status: 400 }
      )
    }

    if (!["raw_idea", "manual_reference", "scraping_command"].includes(input_mode)) {
      return NextResponse.json(
        { error: "input_mode must be one of: raw_idea, manual_reference, scraping_command" },
        { status: 400 }
      )
    }

    // Fetch subreddit
    const { data: subreddit, error: subError } = await supabase
      .from("reddit_subreddits")
      .select("*")
      .eq("id", subreddit_id)
      .single()

    if (subError || !subreddit) {
      return NextResponse.json({ error: "Subreddit not found" }, { status: 404 })
    }

    // Fetch identity (optional)
    let identity: RedditIdentity | null = null
    if (identity_id) {
      const { data } = await supabase
        .from("reddit_identities")
        .select("*")
        .eq("id", identity_id)
        .single()
      identity = data
    }

    // Fetch tone (optional)
    let tone: RedditTone | null = null
    if (tone_id) {
      const { data } = await supabase
        .from("reddit_tones")
        .select("*")
        .eq("id", tone_id)
        .single()
      tone = data
    }

    // Fetch global prompt (active one)
    let globalPrompt: GlobalPrompt | null = null
    const { data: gpData } = await supabase
      .from("reddit_global_prompt")
      .select("*")
      .eq("is_active", true)
      .single()
    globalPrompt = gpData

    // Fetch engagement items (optional)
    let engagementItems: EngagementItem[] = []
    if (engagement_item_ids && Array.isArray(engagement_item_ids) && engagement_item_ids.length > 0) {
      const { data } = await supabase
        .from("engagement_library")
        .select("*")
        .in("id", engagement_item_ids)
      engagementItems = data || []
    }

    // Build prompt
    const ctx: RedditPromptContext = {
      subreddit: subreddit as RedditSubreddit,
      identity,
      tone,
      globalPrompt,
      engagementItems,
      inputMode: input_mode,
      inputContent: input_content,
    }

    const { systemPrompt, userPrompt } = buildRedditPostPrompt(ctx)

    // Resolve AI provider
    const settings = await getSettings()
    const provider = resolveProvider(settings?.ai_provider as AIProvider)

    // Generate post
    console.log("[Reddit Generate] Provider:", provider)
    const aiResponse = await generatePosts(systemPrompt, userPrompt, provider)

    // Parse JSON from AI response
    const parsed = extractJson(aiResponse)
    if (!parsed) {
      console.error("[Reddit Generate] Failed to parse JSON from AI response:", aiResponse.slice(0, 500))
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 500 }
      )
    }

    // Save to database
    const { data: savedPost, error: saveError } = await supabase
      .from("reddit_generated_posts")
      .insert({
        subreddit_id,
        title: parsed.title,
        body: parsed.body,
        status: "in_review",
        input_mode,
        input_content,
        identity_id: identity_id || null,
        tone_id: tone_id || null,
        version_number: 1,
      })
      .select()
      .single()

    if (saveError) {
      console.error("[Reddit Generate] Save error:", saveError)
      return NextResponse.json(
        { error: "Failed to save generated post" },
        { status: 500 }
      )
    }

    return NextResponse.json(savedPost)
  } catch (err) {
    console.error("[Reddit Generate] Error:", err)
    return NextResponse.json(
      { error: "Post generation failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
