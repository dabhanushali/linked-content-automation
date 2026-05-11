import { NextRequest, NextResponse } from "next/server"
import { getSettings } from "@/lib/settings"
import { generatePosts, resolveProvider, AIProvider } from "@/lib/ai"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

const SCORE_PROMPT = `You are a LinkedIn post quality analyst. Score this post on 4 dimensions based on 2025 LinkedIn algorithm research.

SCORING CRITERIA:

1. HOOK STRENGTH (0-25 pts)
   - 25: First line ≤10 words with a specific number, shocking stat, or genuine pattern interrupt
   - 18-24: Strong hook but slightly generic or over 10 words
   - 10-17: Weak hook — opinion-based, vague, or starts with "I" without a compelling premise
   - 0-9: No real hook — reads like a body paragraph

2. DWELL TIME POTENTIAL (0-25 pts)
   - 25: Short paragraphs, lots of white space, Grade 5–7 reading level, strong "see more" pull
   - 18-24: Good structure but some dense passages
   - 10-17: Moderate density — some readers will scroll past
   - 0-9: Wall of text or so short there's nothing to dwell on

3. COMMENT MAGNET (0-25 pts)
   - 25: Ends with a specific, polarizing question that demands a real answer (15+ words from commenters)
   - 18-24: Good closing question but slightly generic
   - 10-17: Weak CTA or engagement bait ("What do you think?")
   - 0-9: No question, or explicit engagement bait ("Comment YES if you agree")

4. ALGORITHM FIT (0-25 pts)
   - 25: 3–5 hashtags, 700–1300 chars, no engagement bait, no AI-sounding phrases
   - 18-24: Minor issues (1-2 extra hashtags, slightly over/under char range)
   - 10-17: Noticeable issues (too long, too many hashtags, or zero hashtags)
   - 0-9: Major violations (engagement bait, >10 hashtags, <200 or >1600 chars, heavy AI tone)

Return ONLY valid JSON:
{
  "hookStrength": 0-25,
  "dwellTime": 0-25,
  "commentMagnet": 0-25,
  "algorithmFit": 0-25,
  "total": 0-100,
  "hookFeedback": "one concise sentence on the hook",
  "topIssue": "the single most impactful fix (one sentence)"
}`

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getRateLimitKey(req, "score"), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` }, { status: 429 })
  }

  const { content } = await req.json()
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  const settings = await getSettings()
  const provider = resolveProvider(settings?.ai_provider as AIProvider)

  try {
    const systemPrompt = settings?.post_scorer_prompt || SCORE_PROMPT
    const text = await generatePosts(
      systemPrompt,
      `Score this LinkedIn post:\n\n${content}`,
      provider
    )
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("No JSON in response")
    const result = JSON.parse(match[0])
    return NextResponse.json(result)
  } catch (err) {
    console.error("Score API error:", err)
    return NextResponse.json({ error: "Scoring failed" }, { status: 500 })
  }
}
