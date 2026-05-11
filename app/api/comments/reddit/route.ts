import { NextRequest, NextResponse } from "next/server"
import { getSettings, buildSystemPrompt, getKnowledgeBase } from "@/lib/settings"
import { generatePosts, resolveProvider, AIProvider } from "@/lib/ai"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { RedditCommentRequestSchema } from "@/lib/schemas"
import { fetchRedditThread } from "@/lib/reddit"

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
  const { trendTitle, trendSummary, trendUrl, archetype, noHarvey, commentSize } = parsed.data

  const sizeMap = { short: "50–100 words", medium: "100–200 words", long: "200–350 words" }

  const isRedditUrl = trendUrl && (trendUrl.includes("reddit.com") || trendUrl.includes("redd.it"))
  const [settings, knowledgeItems, thread] = await Promise.all([
    getSettings(),
    getKnowledgeBase(),
    isRedditUrl ? fetchRedditThread(trendUrl) : Promise.resolve(null),
  ])
  const provider = resolveProvider(settings?.ai_provider as AIProvider)
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
    ? `First, choose the BEST archetype for this thread from the list below. Return your choice as "recommendedArchetype".`
    : `Use the archetype: **${archetype}**`

  if (settings?.reddit_comment_prompt) {
    userPrompt = settings.reddit_comment_prompt
      .replace("{{trendTitle}}", trendTitle)
      .replace("{{threadContext}}", threadContext || (trendSummary ? `Thread summary: ${trendSummary}` : ""))
      .replace("{{archetypeSelection}}", archetypeSelection)
      .replace("{{archetypeList}}", archetypeList)
      .replace("{{harveyRules}}", harveyRules)
      .replace("{{commentSize}}", sizeMap[commentSize])
  } else {
    userPrompt = `You are writing a Reddit comment for a B2B sales / AI tools thread.

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
- RD-007: Use Reddit-native formatting: **bold** for key terms, numbered lists, line breaks between paragraphs

AUTHENTICITY RULES (critical — Reddit users instantly spot AI-generated comments):
- Write as a real practitioner would: include at least one specific detail (a number, a timeframe, a named tool, a situation you observed). Vague generalities = AI signal.
- Use natural asymmetry: vary sentence length, let one thought trail off, qualify one claim ("at least in my experience"). Perfectly balanced clauses = AI signal.
- Do NOT polish every sentence. One slightly imperfect transition or informal phrase is better than perfect prose.
- Never open with "Great question" or "That's a really important point" — those are AI giveaways.
- Do NOT reuse the same opening word or sentence structure if generating multiple comments in a session.

Return ONLY valid JSON:
{
  "comment": "the full comment text with Reddit formatting",
  "archetype": "the archetype name used",
  "wordCount": 145,
  "recommendedArchetype": "same as archetype if auto-selected, or null if archetype was specified"
}`
  }

  try {
    const text = await generatePosts(systemPrompt, userPrompt, provider)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON in response")
    const result = JSON.parse(jsonMatch[0])

    return NextResponse.json(result)
  } catch (err) {
    console.error("Reddit comment error:", err)
    return NextResponse.json({ error: "Comment generation failed" }, { status: 500 })
  }
}
