import { NextRequest, NextResponse } from "next/server"
import { getSettings, buildSystemPrompt, getKnowledgeBase } from "@/lib/settings"
import { generatePosts, resolveProvider, AIProvider } from "@/lib/ai"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { LinkedInCommentRequestSchema } from "@/lib/schemas"

const LINKEDIN_ARCHETYPES = {
  "Add a Layer": {
    trigger: "Post makes a good point that can be extended",
    style: "Agree briefly → add unique angle → close with micro-insight",
    wordCount: "40–80 words",
  },
  "The Bridge": {
    trigger: "Post is outside sales/AI domain",
    style: "Acknowledge → draw parallel to B2B sales domain → universal principle",
    wordCount: "40–70 words",
  },
  "The Question": {
    trigger: "Author has real expertise; post invites depth",
    style: "Brief validation → ask one specific, thoughtful question",
    wordCount: "30–60 words",
  },
  "The Data Drop": {
    trigger: "Post makes a claim that data can support or challenge",
    style: "React to claim → add specific stat → state practical implication",
    wordCount: "40–80 words",
  },
  "Warm Congrats": {
    trigger: "Celebration post (press, milestones, new role)",
    style: "Genuine congrats → highlight a specific detail → optional forward-looking observation",
    wordCount: "25–50 words",
  },
  "The Contrarian": {
    trigger: "Post makes a debatable claim; room for reframe",
    style: "Acknowledge their argument → present alternative view with evidence → stay respectful",
    wordCount: "50–80 words",
  },
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getRateLimitKey(req, "comments"), 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` }, { status: 429 })
  }

  const body = await req.json()
  const parsed = LinkedInCommentRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { postContent, archetype } = parsed.data

  const [settings, knowledgeItems] = await Promise.all([getSettings(), getKnowledgeBase()])
  const provider = resolveProvider(settings?.ai_provider as AIProvider)
  const systemPrompt = settings ? await buildSystemPrompt(settings, knowledgeItems) : ""

  const archetypeList = Object.entries(LINKEDIN_ARCHETYPES)
    .map(([name, def]) => `**${name}**\n  Trigger: ${def.trigger}\n  Style: ${def.style}\n  Length: ${def.wordCount}`)
    .join("\n\n")

  const autoMode = !archetype || archetype === "auto"

  let userPrompt = ""
  const archetypeSelection = autoMode
    ? `First, choose the BEST archetype for this post from the list below. Return your choice as "recommendedArchetype". Then generate 2 variants: one using the recommended archetype, and one using a different complementary archetype.`
    : `Use the archetype: **${archetype}**. Generate 2 variants both using this archetype with different angles.`

  if (settings?.linkedin_comment_prompt) {
    userPrompt = settings.linkedin_comment_prompt
      .replace("{{postContent}}", postContent)
      .replace("{{archetypeSelection}}", archetypeSelection)
      .replace("{{archetypeList}}", archetypeList)
  } else {
    userPrompt = `You are writing a LinkedIn comment in Harvey's voice.

Original LinkedIn post:
"""
${postContent}
"""

${archetypeSelection}

Available archetypes:
${archetypeList}

LINKEDIN COMPLIANCE RULES (mandatory):
- LI-001: NO product names, company names, or URLs
- LI-002: Do NOT start with "Great post!" or any empty praise
- LI-003: Length must be 25–80 words per comment
- LI-004: MAX 1 emoji total (0 preferred)
- LI-005: Tone must match the post type (warm for celebrations, precise for data posts)
- LI-006: Must contain at least one insight NOT present in the original post
- LI-007: Do NOT use "we" or "our" when referencing a product or company

End with a question approximately 30% of the time.

Return ONLY valid JSON:
{
  "variants": [
    {
      "archetype": "archetype name",
      "body": "the comment text",
      "wordCount": 52,
      "recommended": true
    },
    {
      "archetype": "archetype name",
      "body": "the comment text",
      "wordCount": 47,
      "recommended": false
    }
  ],
  "recommendedArchetype": "archetype name if auto-selected, or null"
}`
  }

  try {
    const text = await generatePosts(systemPrompt, userPrompt, provider)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error("LinkedIn AI Raw Response (No JSON found):", text)
      throw new Error("No JSON in response")
    }
    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json(result)
  } catch (err) {
    console.error("LinkedIn comment error:", err)
    return NextResponse.json({ 
      error: "Comment generation failed",
      details: err instanceof Error ? err.message : String(err)
    }, { status: 500 })
  }
}
