import { NextRequest, NextResponse } from "next/server"
import { getSettings, buildSystemPrompt, getKnowledgeBase } from "@/lib/settings"
import { generatePosts, resolveProvider, AIProvider } from "@/lib/ai"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { RedditCommentRequestSchema } from "@/lib/schemas"
import { fetchRedditThread } from "@/lib/reddit"
import { supabase } from "@/lib/supabase/client"
import { buildRedditCommentPrompt } from "@/lib/reddit/prompt-builder"
import {
  RedditIdentity,
  RedditTone,
  GlobalPrompt,
  CommentTemplate,
} from "@/lib/reddit/types"

const REDDIT_ARCHETYPES = {
  "Detailed Helper": {
    trigger: "Someone asks a specific how-to question",
    style: "Acknowledge problem → structured 3–5 step answer → share relevant experience",
    wordCount: "100–250 words",
  },
  "Tool Roundup": {
    trigger: "Someone asks 'what tools for X?'",
    style: "List 3–5 tools with honest pros/cons → if mentioning Harvey, place it in the middle with full disclosure",
    wordCount: "100–200 words",
  },
  "Storyteller": {
    trigger: "Thread invites personal experience sharing",
    style: "Situation → what we tried → what failed → what worked → key takeaway",
    wordCount: "150–300 words",
  },
  "Myth Buster": {
    trigger: "Someone makes a debatable claim",
    style: "Acknowledge why they think that → reframe with data or evidence → nuanced take",
    wordCount: "80–200 words",
  },
  "Mini-Guide": {
    trigger: "Broad 'how do I...' question",
    style: "Context → numbered steps with detail → common mistakes → offer to answer more",
    wordCount: "200–350 words",
  },
}

// Map archetype display names to internal keys
const ARCHETYPE_KEY_MAP: Record<string, string> = {
  "Detailed Helper": "detailed_helper",
  "Tool Roundup": "tool_roundup",
  "Storyteller": "storyteller",
  "Myth Buster": "myth_buster",
  "Mini-Guide": "mini_guide",
  detailed_helper: "detailed_helper",
  tool_roundup: "tool_roundup",
  storyteller: "storyteller",
  myth_buster: "myth_buster",
  mini_guide: "mini_guide",
  auto: "auto",
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getRateLimitKey(req, "comments"), 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` }, { status: 429 })
  }

  const body = await req.json()
  const parsed = RedditCommentRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { trendTitle, trendSummary, trendUrl, archetype, noHarvey, commentSize, instructions } = parsed.data

  // Optional enhanced fields for identity/tone/template integration
  const identityId: string | undefined = body.identity_id
  const toneId: string | undefined = body.tone_id
  const templateId: string | undefined = body.template_id

  const sizeMap = { short: "30–60 words (2-3 sentences MAX)", medium: "80–150 words (one short paragraph)", long: "150–250 words (2 short paragraphs max)" }

  const isRedditUrl = trendUrl && (trendUrl.includes("reddit.com") || trendUrl.includes("redd.it"))
  const [settings, knowledgeItems, thread] = await Promise.all([
    getSettings(),
    getKnowledgeBase(),
    isRedditUrl ? fetchRedditThread(trendUrl) : Promise.resolve(null),
  ])
  const provider = resolveProvider(settings?.ai_provider as AIProvider)

  // If identity_id or tone_id is provided, use the enhanced prompt builder
  if (identityId || toneId) {
    try {
      // Fetch identity
      let identity: RedditIdentity | null = null
      if (identityId) {
        const { data } = await supabase
          .from("reddit_identities")
          .select("*")
          .eq("id", identityId)
          .single()
        identity = data
      }

      // Fetch tone
      let tone: RedditTone | null = null
      if (toneId) {
        const { data } = await supabase
          .from("reddit_tones")
          .select("*")
          .eq("id", toneId)
          .single()
        tone = data
      }

      // Fetch global prompt
      let globalPrompt: GlobalPrompt | null = null
      const { data: gpData } = await supabase
        .from("reddit_global_prompt")
        .select("*")
        .eq("is_active", true)
        .single()
      globalPrompt = gpData

      // Fetch template
      let template: CommentTemplate | null = null
      if (templateId) {
        const { data } = await supabase
          .from("reddit_comment_templates")
          .select("*")
          .eq("id", templateId)
          .single()
        template = data
      }

      // Map archetype to internal key
      const archetypeKey = ARCHETYPE_KEY_MAP[archetype || "auto"] || "auto"

      // Build top comments array
      const topComments: string[] = thread?.topComments
        ? thread.topComments.map((c) => `u/${c.author} (${c.score} upvotes): ${c.body}`)
        : []

      const { systemPrompt: enhancedSystem, userPrompt: enhancedUser } = buildRedditCommentPrompt({
        threadTitle: trendTitle,
        threadBody: thread?.body || trendSummary || "",
        topComments,
        identity,
        tone,
        globalPrompt,
        archetype: archetypeKey,
        size: commentSize,
        template,
        instructions: instructions || undefined,
      })

      const text = await generatePosts(enhancedSystem, enhancedUser, provider)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error("AI returned a non-JSON response.")
      }
      const result = JSON.parse(jsonMatch[0])
      return NextResponse.json(result)
    } catch (err) {
      console.error("[Reddit Enhanced Comment] Error:", err)
      return NextResponse.json({
        error: "Comment generation failed",
        details: err instanceof Error ? err.message : String(err),
      }, { status: 500 })
    }
  }

  // Fallback: original behavior without identity/tone
  const systemPrompt = settings ? await buildSystemPrompt(settings, knowledgeItems) : ""

  const archetypeList = Object.entries(REDDIT_ARCHETYPES)
    .map(([name, def]) => `**${name}**\n  Trigger: ${def.trigger}\n  Style: ${def.style}\n  Length: ${def.wordCount}`)
    .join("\n\n")

  const autoMode = !archetype || archetype === "auto"

  let threadContext = ""
  if (thread) {
    threadContext = `Original post:\n${thread.body || "(no post body — title only)"}`
    if (thread.topComments.length > 0) {
      threadContext += "\n\nTop comments:\n" + thread.topComments
        .map((c, i) => `${i + 1}. u/${c.author} (${c.score} upvotes): ${c.body}`)
        .join("\n\n")
    }
  }

  let userPrompt = ""
  const harveyRules = noHarvey
    ? "- RD-003: Do NOT mention Harvey, any AI tool, or any specific product. Focus entirely on providing genuine value."
    : "- RD-003: If you mention Harvey, add disclosure: \"disclosure: I'm building this\"\n- RD-004: If Harvey is mentioned, also list 2+ competitor alternatives (e.g. Salesloft, Apollo, Clay)\n- RD-008: Harvey mention must be <10% of total word count — focus on providing value"
  const archetypeSelection = autoMode
    ? `Select the most appropriate archetype from the list below and include it in the JSON as "recommendedArchetype".`
    : `Follow the instructions for the "**${archetype}**" archetype.`

  if (settings?.reddit_comment_prompt) {
    userPrompt = settings.reddit_comment_prompt
      .replace("{{trendTitle}}", trendTitle)
      .replace("{{threadContext}}", threadContext || (trendSummary ? `Thread summary: ${trendSummary}` : ""))
      .replace("{{archetypeSelection}}", archetypeSelection)
      .replace("{{archetypeList}}", archetypeList)
      .replace("{{harveyRules}}", harveyRules)
      .replace("{{commentSize}}", sizeMap[commentSize])
  } else {
    userPrompt = `You are a real Reddit user typing a quick reply. NOT a content marketer. NOT an AI. A person who saw this post and has something useful to say.

Thread topic: "${trendTitle}"
${threadContext || (trendSummary ? `Thread summary: ${trendSummary}` : "")}
${!thread && trendUrl ? `Thread URL: ${trendUrl}` : ""}

${archetypeSelection}

Available archetypes:
${archetypeList}

REDDIT COMPLIANCE RULES (mandatory):
- RD-001: NO direct links of any kind
- RD-002: NO corporate language (leverage, synergize, scalable solution, game-changer, etc.)
${harveyRules}
- RD-005: NO emojis, NO hashtags
- RD-006: Length must be ${sizeMap[commentSize]} — this overrides archetype word count defaults
- RD-007: Use Reddit-native formatting: **bold** for key terms (max 2), line breaks between paragraphs

HUMANIZATION RULES (critical — Reddit users instantly spot AI-generated comments):
- Respond to ONE specific thing from the post. Not the whole post.
- Share a concrete experience or opinion. Include a real detail (number, time, problem).
- Keep sentences under 20 words. Mix short and medium.
- Use contractions naturally (don't, it's, won't, I've)
- DO NOT use filler adverbs: "honestly", "tbh", "basically", "fwiw", "imo", "literally"
- DO NOT use corporate words: "comprehensive", "stellar", "robust", "scalability"
- DO NOT use marketing patterns: "if you're looking for", "worth considering", "set them apart"
- No summary at the end. Just stop when your thought is done.
- No semicolons.
- Sound like you typed this in 30 seconds.
- If it reads like a product review or recommendation, rewrite as a personal experience.

GOOD example:
"We switched from GloriaFood to EnactOn about 4 months ago for our 8 locations. Setup was rough — took almost a month to get the driver app working right. But not paying per-restaurant anymore saves us like $400/mo so it worked out."

BAD example (NEVER produce this):
"EnactOn is a fantastic choice for multi-restaurant operators seeking full control. Honestly, their one-time licensing model sets them apart. Tbh if you're serious about scaling, it's worth a deeper look."
${instructions ? `\nYOUR ANGLE FOR THIS COMMENT:\nYou want to mention: "${instructions}"\nWrite from YOUR OWN perspective. You discovered/experienced this yourself. OP did NOT mention it — you are adding new info to the thread.\n` : ""}
Return ONLY valid JSON:
{
  "comment": "the full comment text with Reddit formatting",
  "archetype": "the archetype name used",
  "wordCount": 145,
  "recommendedArchetype": "same as archetype if auto-selected, or null if archetype was specified"
}`
  }

  try {
    console.log("[Reddit] Generating with provider:", provider)
    console.log("[Reddit] User Prompt Preview:", userPrompt.slice(0, 200) + "...")
    
    const text = await generatePosts(systemPrompt, userPrompt, provider)
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error("[Reddit] No JSON found in response. Raw text:", text)
      throw new Error("AI returned a non-JSON response. Check your custom template.")
    }
    
    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json(result)
  } catch (err) {
    console.error("[Reddit] Generation error:", err)
    return NextResponse.json({ 
      error: "Comment generation failed", 
      details: err instanceof Error ? err.message : String(err),
      hint: "Ensure your custom template includes 'Return ONLY valid JSON' and the expected JSON structure."
    }, { status: 500 })
  }
}
