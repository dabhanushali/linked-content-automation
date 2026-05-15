// Anti-AI Generation Engine
// Eliminates common AI tropes and enforces human-like writing patterns.
// These rules are injected into system prompts at generation time.

/**
 * Phrases that immediately signal AI-generated content.
 * Any generated text containing these MUST be rejected/regenerated.
 */
export const BANNED_PHRASES: string[] = [
  "In today's fast-paced world",
  "Ultimately",
  "It's worth noting",
  "Leverage",
  "Synergize",
  "Game-changer",
  "Dive deep",
  "At the end of the day",
  "In the world of",
  "Lessons from",
  "Let's unpack",
  "Here's the thing",
  "It goes without saying",
  "In this day and age",
  "Moving forward",
]

/**
 * Opening phrases that immediately signal AI-generated comments.
 * Comments MUST NOT start with any of these.
 */
export const BANNED_OPENERS: string[] = [
  "Great question",
  "That's a really important point",
  "This is such a great post",
  "Thanks for sharing this",
  "I completely agree with",
  "What a fantastic",
  "Absolutely love this",
]

/**
 * Returns the full anti-AI rules block formatted for system prompt injection.
 * This is prepended to all Reddit generation prompts.
 */
export function getAntiAIRules(): string {
  const bannedPhrasesList = BANNED_PHRASES.map((p) => `  - "${p}"`).join("\n")
  const bannedOpenersList = BANNED_OPENERS.map((p) => `  - "${p}"`).join("\n")

  return `## ANTI-AI DETECTION RULES (MANDATORY)

You MUST follow ALL of these rules. Violation of any rule means the output is rejected.

### 1. BANNED PHRASES — Never use these:
${bannedPhrasesList}

### 2. BANNED OPENERS — Never start with:
${bannedOpenersList}

### 3. WORD SPACING — Zero tolerance for word-smushing:
- Every word MUST have proper spacing. Example of violation: "SaaSCommunityin" should be "SaaS Community in"
- Double-check compound words and transitions between sentences

### 4. SENTENCE LENGTH VARIATION:
- No more than 3 consecutive sentences of similar length
- Mix short punchy sentences (5-10 words) with medium (15-25 words) and occasional longer ones
- Vary paragraph length: some 1-2 sentences, some 3-4

### 5. SPECIFIC DETAILS:
- Include at least one specific detail per 100 words
- Specific details include: a number, a timeframe, a named tool/company, an observed situation, a metric
- Never be vague when you can be concrete

### 6. NO EMOJIS OR HASHTAGS:
- Zero emojis in any generated content
- Zero hashtags in any generated content
- These are instant AI detection signals on Reddit

### 7. NO PROMOTIONAL LINKS:
- Do not include any URLs or links unless the user explicitly requests them
- No "check out my..." or "visit..." patterns

### 8. REDDIT MARKDOWN FORMATTING:
- Use **bold** for emphasis (not italics)
- Use numbered lists for sequential steps
- Use line breaks between paragraphs
- Use headers (#, ##) sparingly and only for long posts
- Never use bullet points for single items

### 9. HUMAN FLOW:
- Write like you're explaining to a colleague, not presenting to an audience
- Use contractions naturally (don't, won't, it's, that's)
- Include occasional self-corrections or qualifiers ("well, actually...", "to be fair...")
- Start some sentences with "And" or "But" — real humans do this
- Use parenthetical asides (like this) occasionally
- Reference personal experience where appropriate`
}
