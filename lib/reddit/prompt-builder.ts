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

  // Anti-AI rules
  systemParts.push(getAntiAIRules())

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
    short: "50–100 words",
    medium: "100–200 words",
    long: "200–350 words",
  }
  systemParts.push(`## SIZE CONSTRAINT\n\nTarget length: ${sizeMap[opts.size]}`)

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

  userParts.push(
    `\nWrite a Reddit comment for this thread. Follow all rules above strictly.`
  )

  const userPrompt = userParts.join("\n\n")

  return { systemPrompt, userPrompt }
}
