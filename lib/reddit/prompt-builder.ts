// Reddit Prompt Builder
// Assembles system and user prompts for Reddit post and comment generation.
// Composes context from subreddit rules, identity, tone, global prompt, anti-AI rules, and engagement items.

import {
  RedditSubreddit,
  RedditIdentity,
  RedditTone,
  GlobalPrompt,
  EngagementItem,
  CommentTemplate,
} from "./types"
import { getAntiAIRules } from "./anti-ai"

export interface RedditPromptContext {
  subreddit: RedditSubreddit
  identity: RedditIdentity | null
  tone: RedditTone | null
  globalPrompt: GlobalPrompt | null
  engagementItems: EngagementItem[]
  inputMode: "raw_idea" | "manual_reference" | "scraping_command"
  inputContent: string
  feedback?: string // for regeneration
}

/**
 * Builds the system and user prompts for Reddit post generation.
 */
export function buildRedditPostPrompt(ctx: RedditPromptContext): {
  systemPrompt: string
  userPrompt: string
} {
  const systemParts: string[] = []

  // Global Agent Directive (only if active)
  if (ctx.globalPrompt && ctx.globalPrompt.is_active) {
    systemParts.push(`## GLOBAL AGENT DIRECTIVE\n\n${ctx.globalPrompt.system_prompt}`)
  }

  // Subreddit rules as strict compliance protocol
  if (ctx.subreddit.rules_clean) {
    systemParts.push(
      `## STRICT COMPLIANCE PROTOCOL — r/${ctx.subreddit.name} Rules\n\n${ctx.subreddit.rules_clean}`
    )
  }

  // Identity profile
  if (ctx.identity) {
    systemParts.push(
      `## IDENTITY PROFILE\n\nName: ${ctx.identity.name}\n\nBackground:\n${ctx.identity.identity_text}\n\nGoals:\n${ctx.identity.goals_text}\n\nRules:\n${ctx.identity.rules_text}`
    )
  }

  // Tone instruction
  if (ctx.tone) {
    systemParts.push(`## TONE INSTRUCTION\n\n${ctx.tone.description}`)
  }

  // Anti-AI rules (for post generation)
  systemParts.push(getAntiAIRules())

  // Core humanization directive
  systemParts.push(`## WRITING STYLE

Write a Reddit post in a natural, conversational tone. Follow these guidelines:

- Use first person perspective naturally.
- Write in a direct, conversational style appropriate for Reddit discussions.
- Keep it concise — 3-6 short paragraphs max.
- No filler sentences. Every sentence should add value.
- Titles should be direct and specific.
- Only include factual information based on the user's input. Do not invent details.
- End with a discussion question or open point.
- Spell all proper nouns correctly from the user's input.
- Use bold sparingly — only for 1-2 key terms maximum.
- No emojis, no hashtags, no promotional links.
- Avoid overly formal or corporate language.`)

  // Engagement items as style references (up to 3)
  if (ctx.engagementItems.length > 0) {
    const refs = ctx.engagementItems.slice(0, 3).map((item, i) => {
      const title = item.title || "(untitled)"
      const body = item.body ? item.body.slice(0, 500) : ""
      return `### Reference ${i + 1}: ${title}\n${body}`
    })
    systemParts.push(`## STYLE REFERENCES\n\nUse these as style and structure inspiration only. Do NOT copy or paraphrase their content.\n\n${refs.join("\n\n")}`)
  }

  // Output format instruction
  systemParts.push(
    `## OUTPUT FORMAT\n\nReturn ONLY valid JSON with exactly these keys:\n{\n  "title": "the post title",\n  "body": "the full post body in Reddit Markdown"\n}\n\nDo not include any text outside the JSON object.`
  )

  const systemPrompt = systemParts.join("\n\n---\n\n")

  // Build user prompt
  const userParts: string[] = []

  // Feedback takes top priority for regeneration
  if (ctx.feedback) {
    userParts.push(
      `## TOP PRIORITY FEEDBACK (from previous review)\n\n${ctx.feedback}\n\nIncorporate this feedback while maintaining all other rules.`
    )
  }

  // Input mode context
  const modeLabels: Record<string, string> = {
    raw_idea: "Topic/Idea",
    manual_reference: "Reference Material (analyze style only, do NOT copy content)",
    scraping_command: "Scraped Content Reference (analyze style only, do NOT copy content)",
  }

  userParts.push(
    `## ${modeLabels[ctx.inputMode]}\n\n${ctx.inputContent}`
  )

  userParts.push(
    `\nGenerate a Reddit post for r/${ctx.subreddit.name}. Follow all rules above strictly.`
  )

  const userPrompt = userParts.join("\n\n")

  return { systemPrompt, userPrompt }
}

/**
 * Builds the system and user prompts for Reddit comment generation.
 */
export function buildRedditCommentPrompt(opts: {
  threadTitle: string
  threadBody: string
  topComments: string[]
  identity: RedditIdentity | null
  tone: RedditTone | null
  globalPrompt: GlobalPrompt | null
  archetype: string | "auto"
  size: "short" | "medium" | "long"
  template: CommentTemplate | null
  instructions?: string
}): { systemPrompt: string; userPrompt: string } {
  const systemParts: string[] = []

  // Global Agent Directive (only if active)
  if (opts.globalPrompt && opts.globalPrompt.is_active) {
    systemParts.push(`## GLOBAL AGENT DIRECTIVE\n\n${opts.globalPrompt.system_prompt}`)
  }

  // Identity profile
  if (opts.identity) {
    systemParts.push(
      `## IDENTITY PROFILE\n\nName: ${opts.identity.name}\n\nBackground:\n${opts.identity.identity_text}\n\nGoals:\n${opts.identity.goals_text}\n\nRules:\n${opts.identity.rules_text}`
    )
  }

  // Tone instruction
  if (opts.tone) {
    systemParts.push(`## TONE INSTRUCTION\n\n${opts.tone.description}`)
  }

  // Anti-AI rules
  systemParts.push(getAntiAIRules())

  // Archetype instructions
  const archetypeInstructions: Record<string, string> = {
    detailed_helper:
      "Archetype: Detailed Helper\nTrigger: Someone asks a specific how-to question\nStyle: Acknowledge problem → structured 3–5 step answer → share relevant experience",
    tool_roundup:
      "Archetype: Tool Roundup\nTrigger: Someone asks 'what tools for X?'\nStyle: List 3–5 tools with honest pros/cons → place any self-mention in the middle with full disclosure",
    storyteller:
      "Archetype: Storyteller\nTrigger: Thread invites personal experience sharing\nStyle: Situation → what we tried → what failed → what worked → key takeaway",
    myth_buster:
      "Archetype: Myth Buster\nTrigger: Someone makes a debatable claim\nStyle: Acknowledge why they think that → reframe with data or evidence → nuanced take",
    mini_guide:
      "Archetype: Mini-Guide\nTrigger: Broad 'how do I...' question\nStyle: Context → numbered steps with detail → common mistakes → offer to answer more",
  }

  if (opts.archetype === "auto") {
    const allArchetypes = Object.values(archetypeInstructions).join("\n\n")
    systemParts.push(
      `## ARCHETYPE SELECTION (AUTO)\n\nSelect the most appropriate archetype based on the thread context:\n\n${allArchetypes}\n\nInclude the selected archetype name in your response.`
    )
  } else if (archetypeInstructions[opts.archetype]) {
    systemParts.push(
      `## ARCHETYPE\n\n${archetypeInstructions[opts.archetype]}`
    )
  }

  // Size constraints
  const sizeMap = {
    short: "30–60 words (2-3 sentences MAX, no more)",
    medium: "80–150 words (one short paragraph)",
    long: "150–250 words (2 short paragraphs max)",
  }
  systemParts.push(`## SIZE CONSTRAINT\n\nTarget length: ${sizeMap[opts.size]}\n\nThis is a HARD limit. Do not exceed it.`)

  // Core humanization directive for comments
  systemParts.push(`## COMMENT STYLE (CRITICAL — HIGHEST PRIORITY)

Write a Reddit comment that sounds like a normal person sharing their experience. No tricks, no forced casualness, no marketing.

RULES:
1. Reference something SPECIFIC from the post (a company name, a detail, a claim OP made)
2. Share a concrete experience or opinion — not generic advice
3. Keep sentences under 20 words. Mix short and medium.
4. Use contractions naturally (don't, it's, won't, I've)
5. No filler adverbs: DO NOT use "honestly", "tbh", "basically", "fwiw", "imo", "literally"
6. No corporate words: "comprehensive", "stellar", "robust", "scalability", "seamlessly"
7. No marketing patterns: "if you're looking for X", "worth considering", "set them apart"
8. No summary sentences at the end. Just stop.
9. No semicolons.
10. Sound like you typed this in 30 seconds, not 5 minutes.

WHAT MAKES A COMMENT SOUND HUMAN:
- It responds to ONE specific thing, not the whole post
- It includes a real detail (a number, a time, a problem encountered)
- It doesn't try to be helpful to everyone — just shares what happened
- It might disagree with something or add a caveat
- It ends mid-thought sometimes

EXAMPLE OF WHAT TO PRODUCE:
"We switched from GloriaFood to EnactOn about 4 months ago for our 8 locations. Setup was rough — took almost a month to get the driver app working right. But not paying per-restaurant anymore saves us like $400/mo so it worked out."

DO NOT PRODUCE ANYTHING LIKE:
"EnactOn is a fantastic choice for multi-restaurant operators seeking full control. Their one-time licensing model sets them apart from SaaS alternatives in the long run."`)

  // Template injection
  if (opts.template) {
    systemParts.push(
      `## COMMENT TEMPLATE\n\nFollow this template structure:\n\n${opts.template.template_text}`
    )
  }

  // Output format
  systemParts.push(
    `## OUTPUT FORMAT\n\nReturn ONLY valid JSON with exactly these keys:\n{\n  "comment": "the full comment text with Reddit formatting",\n  "archetype": "the archetype name used",\n  "wordCount": <number>\n}\n\nDo not include any text outside the JSON object.`
  )

  const systemPrompt = systemParts.join("\n\n---\n\n")

  // Build user prompt with thread context
  const userParts: string[] = []

  userParts.push(`## THREAD CONTEXT\n\nTitle: ${opts.threadTitle}`)

  if (opts.threadBody) {
    userParts.push(`Post body:\n${opts.threadBody}`)
  }

  if (opts.topComments.length > 0) {
    userParts.push(
      `Top comments:\n${opts.topComments.map((c, i) => `${i + 1}. ${c}`).join("\n\n")}`
    )
  }

  if (opts.instructions) {
    userParts.push(
      `## YOUR ANGLE FOR THIS COMMENT\n\nYou want to mention: "${opts.instructions}"\n\nWrite the comment FROM YOUR OWN PERSPECTIVE about this. You are adding this information to the thread — OP did NOT mention it. You discovered/experienced this yourself.`
    )
  }

  userParts.push(
    `\nWrite a Reddit comment for this thread. Follow all rules above strictly.`
  )

  const userPrompt = userParts.join("\n\n")

  return { systemPrompt, userPrompt }
}
