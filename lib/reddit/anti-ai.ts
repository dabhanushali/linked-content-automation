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
  "It's important to note",
  "That being said",
  "With that said",
  "Having said that",
  "It's crucial to",
  "It's essential to",
  "Needless to say",
  "In conclusion",
  "To summarize",
  "In summary",
  "Overall",
  "Furthermore",
  "Moreover",
  "Additionally",
  "Consequently",
  "Nevertheless",
  "Notwithstanding",
  "In light of",
  "With respect to",
  "In terms of",
  "When it comes to",
  "It should be noted",
  "One might argue",
  "It can be argued",
  "Delve into",
  "Navigate the complexities",
  "Robust solution",
  "Seamlessly",
  "Streamline",
  "Holistic approach",
  "Paradigm shift",
  "Best practices",
  "Circle back",
  "Touch base",
  "Low-hanging fruit",
  "Stellar choice",
  "Worth considering",
  "Set them apart",
  "In the long run",
  "True ownership",
  "Financially restrictive",
  "Seasoned operators",
  "Entry requirements",
  "Quick start",
  "Might be worth",
  "Comprehensive solution",
  "Ideal for",
  "Especially with",
  "Despite the higher",
  "Scalability",
  "If you're serious about",
  "If you're looking for",
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
  "This resonates with me",
  "I couldn't agree more",
  "As someone who",
  "I think this is",
  "This is a great",
  "I appreciate you sharing",
  "Wow, this is",
  "I love this",
  "So true",
  "100% this",
  "This right here",
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
- No more than 2 consecutive sentences of similar length
- Mix short punchy sentences (3-8 words) with medium (12-20 words) and occasional longer ones
- Vary paragraph length: some 1 sentence, some 2-3

### 5. SPECIFIC DETAILS:
- Include at least one specific detail per 80 words
- Specific details include: a number, a timeframe, a named tool/company, an observed situation, a metric
- Never be vague when you can be concrete
- Reference real-world scenarios, not hypotheticals

### 6. NO EMOJIS OR HASHTAGS:
- Zero emojis in any generated content
- Zero hashtags in any generated content
- These are instant AI detection signals on Reddit

### 7. NO PROMOTIONAL LINKS:
- Do not include any URLs or links unless the user explicitly requests them
- No "check out my..." or "visit..." patterns

### 8. REDDIT MARKDOWN FORMATTING:
- Use **bold** for emphasis (not italics) — max 2 bold phrases per comment
- Use numbered lists for sequential steps only
- Use line breaks between paragraphs
- Never use bullet points for single items

### 9. HUMAN WRITING PATTERNS (CRITICAL):
- Write like a normal person sharing their experience in a comment
- Use contractions naturally (don't, won't, it's, that's, I've, we're, couldn't)
- DO NOT force casualness with filler words (no "tbh", "honestly", "basically", "fwiw", "imo", "literally")
- Start some sentences with "And", "But", "So" — but don't overdo it
- Use parenthetical asides (like this) sparingly
- Reference your own uncertainty naturally: "I think", "not sure but", "from what I remember"
- Respond to the SPECIFIC situation, not the general topic
- NEVER use semicolons
- No perfect parallel structure in lists
- End when your thought is done. No wrap-up sentence.

### 10. ANTI-PATTERN DETECTION:
- If your comment could apply to ANY post about this topic, it's too generic. Rewrite.
- If every sentence follows Subject-Verb-Object pattern, vary structure.
- If you have exactly 3 or 5 points, consider 2 or 4 instead.
- Never summarize what you just said. No "In summary" or "Overall" or "To wrap up".
- Don't answer questions that weren't asked.
- If it reads like a product review or recommendation, rewrite as personal experience.`
}
