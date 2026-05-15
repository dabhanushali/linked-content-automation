import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { resolveProvider, generatePosts, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"
import { buildRedditPostPrompt, RedditPromptContext } from "@/lib/reddit/prompt-builder"
import { extractJson } from "@/app/api/reddit/generate/route"
import {
  RedditSubreddit,
  RedditIdentity,
  RedditTone,
  GlobalPrompt,
  EngagementItem,
} from "@/lib/reddit/types"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-generate-review"), 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  const { id } = await params

  try {
    const body = await req.json()
    const { feedback } = body

    if (!feedback || typeof feedback !== "string") {
      return NextResponse.json(
        { error: "feedback is required for regeneration" },
        { status: 400 }
      )
    }

    // Fetch the existing post
    const { data: existingPost, error: fetchError } = await supabase
      .from("reddit_generated_posts")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !existingPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    // Fetch subreddit
    const { data: subreddit } = await supabase
      .from("reddit_subreddits")
      .select("*")
      .eq("id", existingPost.subreddit_id)
      .single()

    if (!subreddit) {
      return NextResponse.json({ error: "Subreddit not found" }, { status: 404 })
    }

    // Fetch identity (optional)
    let identity: RedditIdentity | null = null
    if (existingPost.identity_id) {
      const { data } = await supabase
        .from("reddit_identities")
        .select("*")
        .eq("id", existingPost.identity_id)
        .single()
      identity = data
    }

    // Fetch tone (optional)
    let tone: RedditTone | null = null
    if (existingPost.tone_id) {
      const { data } = await supabase
        .from("reddit_tones")
        .select("*")
        .eq("id", existingPost.tone_id)
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

    // Build prompt with feedback
    const ctx: RedditPromptContext = {
      subreddit: subreddit as RedditSubreddit,
      identity,
      tone,
      globalPrompt,
      engagementItems: [],
      inputMode: existingPost.input_mode,
      inputContent: existingPost.input_content || "",
      feedback,
    }

    const { systemPrompt, userPrompt } = buildRedditPostPrompt(ctx)

    // Resolve AI provider
    const settings = await getSettings()
    const provider = resolveProvider(settings?.ai_provider as AIProvider)

    // Generate post
    const aiResponse = await generatePosts(systemPrompt, userPrompt, provider)

    // Parse JSON from AI response
    const parsed = extractJson(aiResponse)
    if (!parsed) {
      return NextResponse.json(
        { error: "AI returned an invalid response. Please try again." },
        { status: 500 }
      )
    }

    // Update the post with new content, increment version, store feedback
    const { data: updatedPost, error: updateError } = await supabase
      .from("reddit_generated_posts")
      .update({
        title: parsed.title,
        body: parsed.body,
        status: "in_review",
        version_number: (existingPost.version_number || 1) + 1,
        feedback,
        approved_at: null,
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to save regenerated post" },
        { status: 500 }
      )
    }

    return NextResponse.json(updatedPost)
  } catch (err) {
    console.error("[Reddit Regenerate] Error:", err)
    return NextResponse.json(
      { error: "Regeneration failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
