import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"

export const maxDuration = 60 // Allow up to 60s for full search and synthesis

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

let _groq: OpenAI | null = null
function getGroq() {
  if (!_groq) {
    _groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    })
  }
  return _groq
}

let _openrouter: OpenAI | null = null
function getOpenRouter() {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/EnactOn/findquestions",
        "X-Title": "Find Questions Engine"
      }
    })
  }
  return _openrouter
}

interface LLMOptions {
  systemPrompt?: string
  userPrompt: string
  model: string
  jsonMode: boolean
}

async function callLLM(options: LLMOptions): Promise<string> {
  const { systemPrompt, userPrompt, model, jsonMode } = options

  const isOpenRouter = model.includes("/")
  const isGroq = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"].includes(model)
  const isAnthropic = ["claude-3-5-sonnet", "claude-3-5-haiku"].includes(model)

  if (isOpenRouter) {
    const openrouter = getOpenRouter()
    const response = await openrouter.chat.completions.create({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: userPrompt }
      ],
      response_format: jsonMode ? { type: "json_object" } : undefined
    })
    return response.choices[0]?.message?.content ?? ""
  }

  if (isGroq) {
    const groq = getGroq()
    const response = await groq.chat.completions.create({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: userPrompt }
      ],
      response_format: jsonMode ? { type: "json_object" } : undefined
    })
    return response.choices[0]?.message?.content ?? ""
  }

  if (isAnthropic) {
    const anthropic = getAnthropic()
    const anthropicModel = model === "claude-3-5-sonnet" ? "claude-3-5-sonnet-20241022" : "claude-3-5-haiku-20241022"
    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userPrompt }]
    })
    return response.content[0].type === "text" ? response.content[0].text : ""
  }

  // Default: OpenAI
  const openai = getOpenAI()
  const openaiModel = model === "gpt-4o-mini" ? "gpt-4o-mini" : "gpt-4o"
  const response = await openai.chat.completions.create({
    model: openaiModel,
    messages: [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: userPrompt }
    ],
    response_format: jsonMode ? { type: "json_object" } : undefined
  })
  return response.choices[0]?.message?.content ?? ""
}

// Interfaces matching the findquestions.com schema
interface PAAQuestion {
  question: string
  search_intent: string
  geo_strategy: string
}

interface RedditSource {
  subreddit: string
  title: string
  url: string
}

interface FindQuestionsResponse {
  business: string
  cached: boolean
  status: string
  threads_analyzed: number
  subreddits: string[]
  sources: RedditSource[]
  questions: PAAQuestion[]
  bonus_topics: string[]
}

function cleanAndParseJSON(text: string): any {
  let cleaned = text.trim();

  // 1. Strip markdown code fences if present
  cleaned = cleaned.replace(/```json\s*([\s\S]*?)\s*```/g, "$1")
    .replace(/```\s*([\s\S]*?)\s*```/g, "$1")
    .trim();

  // 2. Extract bounding braces to handle any leading/trailing conversational text
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  // 3. Try parsing
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn("  [JSON Repair] Standard JSON.parse failed. Attempting structural repairs...", err);
  }

  // 4. Structural Repairs for unquoted/single-quoted keys/values
  try {
    let repaired = cleaned
      .replace(/([{,]\s*)'([^'\\]+)'(\s*:)/g, '$1"$2"$3') // Single-quoted keys to double-quoted keys
      .replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3') // Unquoted keys to double-quoted keys
      .replace(/:\s*'([^'\\]*)'/g, ': "$1"') // Single-quoted string values to double-quoted string values
      .replace(/,\s*'([^'\\]*)'/g, ', "$1"') // Single-quoted string values in arrays/lists
      .replace(/\[\s*'([^'\\]*)'/g, '[ "$1"')
      .replace(/'([^'\\]*)'\s*\]/g, '"$1" ]');

    return JSON.parse(repaired);
  } catch (err2: any) {
    throw new Error(`Failed to parse JSON response. Parser message: ${err2.message}. Original text snippet: ${text.slice(0, 1000)}`);
  }
}

async function fetchGoogleAutocomplete(query: string, coreEntity: string): Promise<string[]> {
  const suffixes = [
    "",
    " vs",
    " alternative",
    " comparison",
    " cost",
    " pricing",
    " how to",
    " what is",
    " free"
  ]
  const prefixes = [
    "why use ",
    "is "
  ]

  const terms = new Set<string>()
  terms.add(query.trim())
  if (coreEntity && coreEntity.trim()) {
    terms.add(coreEntity.trim())
  }

  // Create suffix variations
  suffixes.forEach(s => {
    terms.add(`${query}${s}`)
    if (coreEntity && coreEntity.trim()) {
      terms.add(`${coreEntity}${s}`)
    }
  })

  // Create prefix variations
  prefixes.forEach(p => {
    terms.add(`${p}${query}`)
    if (coreEntity && coreEntity.trim()) {
      terms.add(`${p}${coreEntity}`)
    }
  })

  const uniqueTerms = Array.from(terms).filter(t => t.length > 2)
  console.log(`  [Autocomplete] Fetching suggestions for ${uniqueTerms.length} variations...`)

  const resultsSet = new Set<string>()

  const promises = uniqueTerms.map(async (term) => {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(term)}`
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(5000)
      })

      if (response.ok) {
        const data = await response.json()
        const suggestions = data[1] || []
        suggestions.forEach((s: string) => {
          if (s && s.trim()) {
            resultsSet.add(s.trim())
          }
        })
      }
    } catch (err: any) {
      // Ignore network errors to stay resilient
    }
  })

  await Promise.allSettled(promises)

  const results = Array.from(resultsSet)
  console.log(`  [Autocomplete] Scraped ${results.length} unique suggestions.`)
  return results
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  console.log("\n\x1b[35m╔══════════════════════════════════════════════════════╗\x1b[0m")
  console.log("\x1b[35m║        FIND QUESTIONS ENGINE — REQUEST STARTED       ║\x1b[0m")
  console.log("\x1b[35m╚══════════════════════════════════════════════════════╝\x1b[0m")

  try {
    // ── INPUT PARSING ───────────────────────────────────────────────────────
    const body = await req.json()
    const { phrase, business, paaProvider, country = "us", language = "en", model = "gpt-4o", persona = "", icp = "" } = body
    const query = (phrase || business || "").trim()
    const providerToUse = paaProvider === "dataforseo" ? "dataforseo" : "serper"

    console.log("\n\x1b[36m[STEP 0] INPUT RECEIVED\x1b[0m")
    console.log("  ┌─ Raw Body  :", JSON.stringify(body))
    console.log("  ├─ Query     :", query)
    console.log("  ├─ Provider  :", providerToUse)
    console.log("  ├─ Country   :", country)
    console.log("  ├─ Language  :", language)
    console.log("  └─ Model     :", model)

    if (!query || query.length < 2) {
      console.log("\x1b[31m[STEP 0] VALIDATION FAILED — Query too short. Returning 400.\x1b[0m")
      return NextResponse.json({ error: "Query phrase must be at least 2 characters long" }, { status: 400 })
    }

    // ── STAGE 1: QUERY EXPANSION ─────────────────────────────────────────────
    console.log(`\n\x1b[36m[STEP 1] QUERY EXPANSION — Calling LLM ${model}...\x1b[0m`)
    const stage1Start = Date.now()

    // consumer_query goes as it is (raw query) as per user requirement
    const consumer_query = query

    const extractionPrompt = `You are a search query expansion assistant.
Our Brand Persona Profile: "${persona}"
Our Target Customer (ICP): "${icp}"

For the user's business niche query: "${query}"

Think like the target customer, not the service provider.

Identify:
- what software they may use
- what alternatives they compare
- what operational problems they face
- what implementation questions they ask
- what communities discuss these problemsExtract:
1. "reddit_related_query_1": A short, extremely focused, and natural related query (no more than 3-4 words) that target customers (ICP) or professionals type into Reddit's search bar to find comparisons, alternatives, or reviews (e.g. use "gloriafood alternatives" or "gloriafood reviews" if query is "gloriafood"). Do NOT include site limits or operators.
2. "reddit_related_query_2": Another distinct, highly focused related query (no more than 3-4 words) that captures a specific feature, integration, or B2B/SaaS pain point (e.g. use "gloriafood pricing" or "gloriafood pos integration" if query is "gloriafood").
3. "target_subreddits": An array of EXACTLY 10 to 15 REAL and ACTIVE Reddit communities only. (You MUST provide at least 10 subreddits).

Rules:
- Use only existing, established subreddits.
- Prefer 100k+ member communities when possible.
- Prefer communities with real discussions.
- Never invent subreddit names.
- ALWAYS generate a minimum of 10 subreddits. If the niche is too small, fill the remainder with broader relevant software/business subreddits (e.g., r/Upwork, r/freelance, r/software, r/SaaS, r/coding).

Avoid:
- niche promotional communities
- company directories
- marketing communities
- autogenerated subreddit names

CRITICAL SUBREDDIT SELECTION RULES:
- Prioritize HYPER-NICHE, industry-specific subreddits over generic business or tech ones.
- For example, if the query is "laundry app", prefer r/laundry, r/laundromat, r/drycleaning over r/startups or r/Entrepreneur.
- If the query is "pet care software", prefer r/petsitting, r/RoverPetSitting, r/doggrooming over r/SaaS.
- If the query is "restaurant POS", prefer r/KitchenConfidential, r/restaurantowners, r/TalesFromYourServer over r/smallbusiness.
- Only use generic software/business subreddits (like r/SaaS, r/startups, r/AppDevelopment, r/Entrepreneur, r/Upwork, r/freelance, r/software, r/coding) as a secondary fallback if the niche is too narrow.

Examples:

Astro:
["astrojs","webdev","frontend","javascript","web_design","nextjs"]

WordPress:
["wordpress","seo","blogging","webdev"]

Mobile App Development:
["AppDevelopment","mobiledev","reactnative","flutterdev","startups","freelance","Upwork","software","SaaS","coding"]
4. "core_entity": The core underlying product, framework, software, or service subject name.

5. "search_queries": Generate EXACTLY 10 realistic Reddit search queries.

IMPORTANT:

Generate searches the BUYER or USER would search.

Do NOT generate agency/service-provider searches.

Avoid:
- top companies
- best agencies
- outsourcing

Prefer:
- buyer problems
- operational challenges
- software categories
- alternatives
- implementation discussions
- startup discussions
- workflow discussions
- software recommendations
- platform comparisons
- real user experiences
Additional Rules:

Never generate:
- near me
- local searches
- city searches
- country searches
- location searches
- transactional searches
- service-provider searches
- agency searches

Avoid:
- "near me"
- "in USA"
- "in India"
- "best company"
- "top companies"
- "hire developers"

Generate discussion-oriented Reddit searches only.

The search query should sound like something a real Reddit user would type when looking for:
- recommendations
- comparisons
- alternatives
- implementation advice
- operational challenges
- software tools
- startup experiences
- user experiences
Example:

Bad:
[
 "laundry app development company",
 "laundry app development services",
 "top laundry app developers"
]

Good:
[
 "laundry app",
 "laundromat software",
 "laundry delivery software",
 "dry cleaning software",
 "laundry startup",
 "pickup and delivery laundry",
 "laundry business software",
 "laundry route optimization",
 "laundry customer management",
 "laundry app alternatives"
]

Example for Astro:

[
  "astro",
  "astro reviews",
  "astro pricing",
  "astro alternatives",
  "astro vs nextjs",
  "astro migration",
  "astro integrations",
  "astro beginner",
  "astro troubleshooting",
  "astro cms"
]

Return ONLY a raw JSON object:

{
  "reddit_related_query_1": "string",
  "reddit_related_query_2": "string",
  "target_subreddits": ["string"],
  "core_entity": "string",
  "search_queries": ["string"]
} `

    // Use a fast model like llama-3.1-8b-instant or gpt-4o-mini if sonnet is not selected to keep it cheap/fast
    const extractionModel = model.includes("sonnet") ? model : (model.includes("llama-3.3") ? model : "llama-3.1-8b-instant")
    const extractedText = await callLLM({
      userPrompt: extractionPrompt,
      model: extractionModel,
      jsonMode: true
    })

    const {
      reddit_related_query_1,
      reddit_related_query_2,
      target_subreddits,
      core_entity,
      search_queries = []
    } = cleanAndParseJSON(extractedText)
    const filteredSearchQueries = search_queries.filter(
      (q: string) =>
        !q.toLowerCase().includes("near me") &&
        !q.toLowerCase().includes("best company") &&
        !q.toLowerCase().includes("top company")
    )
    console.log(`\x1b[32m[STEP 1] ✓ QUERY EXPANSION DONE (${Date.now() - stage1Start}ms)\x1b[0m`)
    console.log("  ┌─ Input Query            :", query)
    console.log("  ├─ consumer_query         :", consumer_query)
    console.log("  ├─ reddit_related_query_1 :", reddit_related_query_1)
    console.log("  ├─ reddit_related_query_2 :", reddit_related_query_2)
    console.log("  ├─ core_entity            :", core_entity)
    console.log("  ├─ search_queries:        :", JSON.stringify(search_queries))
    console.log("  ├─ search_queries count   :", search_queries?.length || 0)
    console.log("  └─ target_subreddits      :", JSON.stringify(target_subreddits))

    // ── STAGE 2: REDDIT SEARCH (JSON-first → RSS-fallback) ─────────────────
    const stage2Start = Date.now()
    let redditSources: RedditSource[] = []

    const REDDIT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    const allQueryWords = `${query} ${consumer_query} ${reddit_related_query_1} ${reddit_related_query_2}`.toLowerCase()
    const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should", "may", "might", "must", "can", "could", "and", "but", "or", "nor", "for", "yet", "so", "in", "on", "at", "to", "from", "by", "with", "of", "about", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "how", "what", "which", "who", "whom", "this", "that", "these", "those", "i", "me", "my", "we", "our", "you", "your", "he", "him", "his", "she", "her", "it", "its", "they", "them", "their"])
    const relevanceKeywords = Array.from(new Set(allQueryWords.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w))))

    console.log("\n\x1b[36m[STEP 2] REDDIT SEARCH — Targeted Subreddits → Broad Fallback\x1b[0m")
    console.log("  ┌─ Original Query    :", query)
    console.log("  ├─ Related Query 1   :", reddit_related_query_1)
    console.log("  ├─ Related Query 2   :", reddit_related_query_2)
    console.log("  ├─ Consumer Query    :", consumer_query)
    console.log("  ├─ Target Subreddits :", JSON.stringify(target_subreddits))
    console.log("  ├─ Relevance Keywords:", JSON.stringify(relevanceKeywords))
    console.log("  └─ Strategy          : Try targeted subreddits first, fallback to broad search")

    // Raw target subreddits mapping
    const rawSubs = (target_subreddits || [])
      .map((s: string) => s.replace(/^r\//i, "").replace(/\s+/g, "").trim())
      .filter(Boolean)

    const buildSubredditQuery = (term: string, subs: string[]) => {
      if (subs.length === 0) return term
      const subFilter = subs.map(s => `subreddit:${s}`).join(" OR ")
      return `(${subFilter}) (${term})`
    }

    // ── Helper: Try search.json (returns structured data with scores) ────
    const fetchViaJSON = async (searchTerm: string, label: string, useSubredditFilter: boolean): Promise<{ title: string; subreddit: string; author: string; permalink: string; selftext: string; score: number; comments: number }[] | null> => {
      const finalSearchTerm = useSubredditFilter && rawSubs.length > 0 ? buildSubredditQuery(searchTerm, rawSubs) : searchTerm
      const encoded = encodeURIComponent(finalSearchTerm)
      const url = `https://old.reddit.com/search.json?q=${encoded}&limit=50&sort=relevance&t=all`

      console.log(`\n  \x1b[36m── JSON Query "${label}" (targeted=${useSubredditFilter}): ${finalSearchTerm.slice(0, 100)}${finalSearchTerm.length > 100 ? "..." : ""} ──\x1b[0m`)
      console.log(`  → URL: ${url}`)

      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": REDDIT_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Ch-Ua": '"Chromium";v="120", "Google Chrome";v="120", "Not_A Brand";v="8"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            "Referer": "https://www.google.com/",
          },
          signal: AbortSignal.timeout(15000)
        })

        console.log(`  → HTTP ${res.status} ${res.statusText}`)

        if (res.status === 403 || res.status === 429) {
          console.warn(`  → \x1b[33mBlocked (${res.status})! Will fall back to RSS.\x1b[0m`)
          return null // signal to use RSS
        }

        if (!res.ok) {
          console.warn(`  → \x1b[33mFailed: ${res.status}\x1b[0m`)
          return null
        }

        const json = await res.json()
        const children = json?.data?.children || []
        console.log(`  → ${children.length} results from search.json`)

        const posts = children
          .filter((c: any) => c.kind === "t3")
          .map((c: any) => {
            const d = c.data
            return {
              title: String(d.title || ""),
              subreddit: String(d.subreddit || ""),
              author: String(d.author || "[deleted]"),
              permalink: `https://reddit.com${d.permalink}`,
              selftext: String(d.selftext || "").slice(0, 200),
              score: Number(d.score || 0),
              comments: Number(d.num_comments || 0)
            }
          })

        posts.forEach((p: any, i: number) => {
          console.log(`  [${i + 1}] \x1b[32mr/${p.subreddit}\x1b[0m | ↑${p.score} | 💬${p.comments}`)
          console.log(`       "${p.title.slice(0, 80)}${p.title.length > 80 ? "…" : ""}"`)
        })

        return posts
      } catch (err: any) {
        console.warn(`  → \x1b[33mJSON fetch error: ${err?.message}\x1b[0m`)
        return null
      }
    }

    // ── Helper: RSS fallback (used when JSON is blocked) ─────────────────
    const fetchViaRSS = async (searchTerm: string, label: string, useSubredditFilter: boolean): Promise<{ title: string; subreddit: string; author: string; permalink: string; selftext: string; score: number; comments: number }[]> => {
      const finalSearchTerm = useSubredditFilter && rawSubs.length > 0 ? buildSubredditQuery(searchTerm, rawSubs) : searchTerm
      const encoded = encodeURIComponent(finalSearchTerm)
      const url = `https://www.reddit.com/search.rss?q=${encoded}&limit=50&sort=relevance&t=all`

      console.log(`\n  \x1b[33m── RSS Fallback "${label}" (targeted=${useSubredditFilter}): ${finalSearchTerm.slice(0, 100)}${finalSearchTerm.length > 100 ? "..." : ""} ──\x1b[0m`)
      console.log(`  → URL: ${url}`)

      try {
        const rssRes = await fetch(url, {
          headers: { "User-Agent": REDDIT_UA, "Accept": "application/xml, text/xml, */*" },
          signal: AbortSignal.timeout(15000)
        })

        console.log(`  → HTTP ${rssRes.status} ${rssRes.statusText}`)

        if (!rssRes.ok) {
          console.warn(`  → \x1b[33mRSS also failed: ${rssRes.status}\x1b[0m`)
          return []
        }

        const xmlText = await rssRes.text()
        console.log(`  → XML size: ${xmlText.length} chars`)

        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
        const results: { title: string; subreddit: string; author: string; permalink: string; selftext: string; score: number; comments: number }[] = []
        let entryMatch

        while ((entryMatch = entryRegex.exec(xmlText)) !== null) {
          const entry = entryMatch[1]

          const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/)
          let title = titleMatch ? titleMatch[1].trim() : ""
          title = title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#32;/g, " ")

          const linkMatch = entry.match(/<link href="([\s\S]*?)"/)
          const permalink = linkMatch ? linkMatch[1] : ""

          const authorMatch = entry.match(/<author><name>\/u\/([\w-]+)<\/name>/) || entry.match(/<author><name>([\s\S]*?)<\/name>/)
          const author = authorMatch ? authorMatch[1] : "[deleted]"

          const subMatch = entry.match(/<category term="([\w-]+)"/)
          const subreddit = subMatch ? subMatch[1] : ""

          const bannedSubs = [
            "nosleep",
            "hiphopheads",
            "adhd",
            "tokyotravel",
            "onebag",
            "amerexit",
            "calgary",
            "carpetbeetles"
          ]

          if (
            bannedSubs.includes(
              subreddit.toLowerCase()
            )
          ) {
            continue
          }

          const contentMatch = entry.match(/<content type="html">([\s\S]*?)<\/content>/)
          let selftext = ""
          if (contentMatch) {
            let decoded = contentMatch[1]
              .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&#32;/g, " ")
            const mdDivMatch = decoded.match(/<div class="md">([\s\S]*?)<\/div>/)
            selftext = mdDivMatch ? mdDivMatch[1].replace(/<[^>]*>/g, " ").trim() : decoded.replace(/<[^>]*>/g, " ").trim()
          }

          // FILTER 1: Must be an actual post
          if (!subreddit || !permalink.includes("/comments/")) {
            console.log(`  [SKIP] \x1b[31m"${title.slice(0, 50)}"\x1b[0m — subreddit page`)
            continue
          }

          // FILTER 2: Adaptive concept-based relevance check for RSS results
          // const haystack = `${title} ${selftext}`.toLowerCase()
          const titleHaystack = title.toLowerCase()
          const bodyHaystack = selftext.toLowerCase()
          const seoPatterns = [
            "top ",
            "best ",
            "companies",
            "development company",
            "development companies",
            "agency",
            "agencies",
            "white label",
            "cost of development",
            "app development",
            "how to launch",
            "launch an app",
            "uber for",
            "key features",
            "mobile application development trends",
            "development costs"
          ]
          if (
            seoPatterns.some(pattern =>
              titleHaystack.includes(pattern)
            )
          ) {
            console.log(
              `  [SEO SKIP] ${title.slice(0, 80)}`
            )
            continue
          }
          const origConcepts = query
            .toLowerCase()
            .split(/\s+/)
            .filter((w: string) => w.length >= 3 && !stopWords.has(w))

          const activeConcepts = searchTerm
            .toLowerCase()
            .split(/\s+/)
            .filter((w: string) => w.length >= 3 && !stopWords.has(w))

          const matchedOrig = origConcepts.filter((kw: string) =>
            titleHaystack.includes(kw)
          )

          const matchedActive = activeConcepts.filter((kw: string) =>
            titleHaystack.includes(kw)
          )

          const isTargetSubreddit = rawSubs.some(
            s =>
              s.replace(/^r\//, "").toLowerCase() ===
              subreddit.toLowerCase()
          )

          const matchesCoreEntity =
            core_entity &&
            titleHaystack.includes(core_entity.toLowerCase())
          const entityTokens = core_entity
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)

          const entityMatches =
            entityTokens.filter(token =>
              titleHaystack.includes(token)

            ).length
          const entityCoverage =
            entityMatches / entityTokens.length
          let relevanceScore = 0

          relevanceScore += matchedOrig.length * 2
          relevanceScore += matchedActive.length * 2
          relevanceScore += entityMatches * 5

          if (isTargetSubreddit)
            relevanceScore += 5
          const preferredSubreddits = new Set([
            "appdevelopment",
            "webdev",
            "saas",
            "programming",
            "smallbusiness",
            "productmanagement",
            "uxdesign",
            "entrepreneur",
            "startups",
            "mobiledev",
            "flutterdev",
            "reactnative",
            "softwaredevelopment"
          ])

          if (
            preferredSubreddits.has(
              subreddit.toLowerCase()
            )
          ) {
            relevanceScore += 5
          }
          if (
            title
              .toLowerCase()
              .includes(core_entity.toLowerCase())
          ) {
            relevanceScore += 10
          }
          // const developmentKeywords = [
          //   "app",
          //   "development",
          //   "developer",
          //   "software",
          //   "startup",
          //   "saas",
          //   "mvp",
          //   "platform",
          //   "mobile",
          //   "flutter",
          //   "react native",
          //   "android",
          //   "ios"
          // ]

          // const developmentMatches =
          //   developmentKeywords.filter(k =>
          //     haystack.includes(k)
          //   ).length

          // const shouldKeep =
          //   (
          //     matchesCoreEntity &&
          //     developmentMatches >= 1
          //   ) ||
          //   (
          //     matchedOrig.length >= 2 &&
          //     developmentMatches >= 1
          //   ) ||
          //   (
          //     matchedActive.length >= 2 &&
          //     developmentMatches >= 1
          //   ) ||
          //   (
          //     isTargetSubreddit &&
          //     developmentMatches >= 1
          //   )

          // if (!shouldKeep) {
          //   console.log(
          //     `  [SKIP] "${title.slice(0, 50)}" — weak relevance`
          //   )
          //   continue
          // }
          if (
            relevanceScore < 10 ||
            entityCoverage < 0.5
          ) {
            console.log(
              `  [SKIP] "${title.slice(0, 50)}" — score=${relevanceScore} | coverage=${entityCoverage}`
            )
            continue
          }
          const matchedWords = Array.from(new Set([...matchedOrig, ...matchedActive]))
          console.log(`  [HIT]  \x1b[32mr/${subreddit}\x1b[0m | matches: [${matchedWords.join(", ")}]`)
          console.log(`         "${title.slice(0, 80)}${title.length > 80 ? "…" : ""}"`)

          results.push({ title, subreddit, author, permalink, selftext: selftext.slice(0, 200), score: 0, comments: 0 })
          console.log(
            `  [HIT SCORE=${relevanceScore}] r/${subreddit} | ${title.slice(0, 80)}`
          )
          if (results.length >= 30) break
        }

        console.log(`  → ${results.length} relevant posts via RSS`)
        return results
      } catch (err: any) {
        console.warn(`  → \x1b[33mRSS error: ${err?.message}\x1b[0m`)
        return []
      }
    }

    try {
      // Build search queries: exact original query + 2 related queries
      const searchQueries: { term: string; label: string }[] = []

      searchQueries.push({
        term: query,
        label: "Exact Query"
      })

      for (const q of filteredSearchQueries) {
        if (
          q &&
          !searchQueries.some(
            s => s.term.toLowerCase() === q.toLowerCase()
          )
        ) {
          searchQueries.push({
            term: q,
            label: "Expanded Query"
          })
        }
      }

      if (reddit_related_query_1 && reddit_related_query_1.toLowerCase() !== query.toLowerCase()) {
        searchQueries.push({ term: reddit_related_query_1, label: "Related Query 1" })
      }
      if (reddit_related_query_2 && reddit_related_query_2.toLowerCase() !== query.toLowerCase() && reddit_related_query_2.toLowerCase() !== reddit_related_query_1.toLowerCase()) {
        searchQueries.push({ term: reddit_related_query_2, label: "Related Query 2" })
      }

      console.log(`\n  Executing ${searchQueries.length} searches:`)
      searchQueries.forEach((sq, i) => console.log(`    [${i + 1}] "${sq.term}" (${sq.label})`))

      // Detect if JSON works on first query; if blocked, use RSS for all
      let useRSS = false
      const allPosts: { title: string; subreddit: string; author: string; permalink: string; selftext: string; score: number; comments: number }[] = []
      const seenPermalinks = new Set<string>()

      for (const sq of searchQueries) {
        let posts: { title: string; subreddit: string; author: string; permalink: string; selftext: string; score: number; comments: number }[] | null = null

        // 1. Try targeted B2B subreddits first
        if (!useRSS) {
          posts = await fetchViaJSON(sq.term, sq.label, true)
          if (posts === null) {
            useRSS = true
            console.log(`\x1b[33m  → Switching to RSS mode due to 403/429 block.\x1b[0m`)
            posts = await fetchViaRSS(sq.term, sq.label, true)
          }
        } else {
          posts = await fetchViaRSS(sq.term, sq.label, true)
        }

        // 2. Fallback to broad search if targeted search returns 0 results
        if (!posts || posts.length === 0) {
          console.log(`  \x1b[33m→ Targeted search returned 0 results. Falling back to broad search for "${sq.term}"...\x1b[0m`)
          if (!useRSS) {
            posts = await fetchViaJSON(sq.term, `${sq.label} (Broad)`, false)
            if (posts === null) {
              useRSS = true
              posts = await fetchViaRSS(sq.term, `${sq.label} (Broad)`, false)
            }
          } else {
            posts = await fetchViaRSS(sq.term, `${sq.label} (Broad)`, false)
          }
        }

        for (const p of posts || []) {
          if (!seenPermalinks.has(p.permalink)) {
            seenPermalinks.add(p.permalink)
            allPosts.push(p)
          }
        }
      }

      const provider = useRSS ? "RSS (JSON was blocked)" : "JSON (direct API)"
      console.log(`\n\x1b[32m[STEP 2] ✓ SEARCH COMPLETE (${Date.now() - stage2Start}ms) — ${allPosts.length} posts via ${provider}\x1b[0m`)

      // Convert to RedditSource format (top 8, sorted by score desc for JSON)
      const sortedPosts = allPosts.sort((a, b) => b.score - a.score)
      redditSources = sortedPosts.map(p => ({
        subreddit: p.subreddit,
        title: p.title,
        url: p.permalink.startsWith("http") ? p.permalink : `https://reddit.com${p.permalink}`
      })).slice(0, 20)

      if (redditSources.length > 0) {
        console.log(`  → Top ${redditSources.length} selected (sorted by score):`)
        redditSources.forEach((s, i) => console.log(`    [${i + 1}] r/${s.subreddit} → ${s.title.slice(0, 60)}`))
      } else {
        console.warn("\x1b[33m  → 0 relevant posts found. Sources will be empty.\x1b[0m")
      }

    } catch (redditErr: any) {
      console.warn(`\x1b[33m[STEP 2] ⚠ Reddit search failed (${Date.now() - stage2Start}ms):`, redditErr?.message || redditErr, "\x1b[0m")
      console.warn("  → Continuing with empty sources.")
    }

    // ── STAGE 3: PAA SEARCH (Serper.dev or DataForSEO) & GOOGLE AUTOCOMPLETE ──
    // const autocompletePromise = fetchGoogleAutocomplete(query, core_entity || "")
    const autocompletePromise = Promise.resolve([])
    let scrapedPAAQuestions: string[] = []

    if (providerToUse === "serper") {
      console.log("\n\x1b[36m[STEP 3] SERPER.DEV PAA — Querying Google People Also Ask...\x1b[0m")
      const serperKey = process.env.SERPER_API_KEY

      if (!serperKey) {
        console.warn("\x1b[33m[STEP 3] ⚠ SERPER_API_KEY not set in .env\x1b[0m")
        console.warn("  → Falling back to LLM-only question generation (no real PAA data).")
      } else {
        console.log("  ┌─ API Endpoint      : https://google.serper.dev/search")
        console.log("  ├─ Keyword           :", consumer_query)
        console.log("  ├─ Country (gl)      :", country)
        console.log("  ├─ Language (hl)     :", language)
        console.log("  └─ Auth Method       : X-API-KEY header")

        const stage3Start = Date.now()

        try {
          const response = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "X-API-KEY": serperKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              q: consumer_query,
              gl: country,
              hl: language
            })
          })

          console.log(`  → Serper.dev HTTP Status: ${response.status} ${response.statusText}`)

          if (response.ok) {
            const resJson = await response.json()
            const paa = resJson.peopleAlsoAsk || []
            const organic = resJson.organic || []
            const related = resJson.relatedSearches || []

            // Extract PAA questions
            const paaQuestions = paa.map((item: any) => item.question || item.title).filter(Boolean)
            // Extract organic search result titles
            const organicTitles = organic.map((item: any) => item.title).filter(Boolean)
            // Extract related searches queries
            const relatedQueries = related.map((item: any) => item.query).filter(Boolean)

            scrapedPAAQuestions = [
              ...paaQuestions,
              ...organicTitles,
              ...relatedQueries
            ]

            console.log(`\x1b[32m[STEP 3] ✓ GOOGLE SEARCH DATA SCRAPED (${Date.now() - stage3Start}ms) — ${scrapedPAAQuestions.length} items found\x1b[0m`)
            console.log(`  ├─ PAA Questions    : ${paaQuestions.length}`)
            console.log(`  ├─ Organic Titles   : ${organicTitles.length}`)
            console.log(`  └─ Related Queries  : ${relatedQueries.length}`)
            scrapedPAAQuestions.forEach((q, i) => console.log(`  [${i + 1}] ${q}`))
          } else {
            const errText = await response.text()
            console.error(`\x1b[31m[STEP 3] ✗ Serper.dev error (${Date.now() - stage3Start}ms): ${response.status}\x1b[0m`)
            console.error("  → Response body:", errText.slice(0, 300))
          }
        } catch (serperErr: any) {
          console.error(`\x1b[31m[STEP 3] ✗ Serper.dev exception:\x1b[0m`, serperErr?.message || serperErr)
        }
      }
    } else {
      console.log("\n\x1b[36m[STEP 3] DATAFORSEO PAA — Querying Google People Also Ask...\x1b[0m")

      const login = process.env.DATAFORSEO_API_LOGIN
      const password = process.env.DATAFORSEO_API_PASSWORD

      if (!login || !password) {
        console.warn("\x1b[33m[STEP 3] ⚠ DATAFORSEO_API_LOGIN or DATAFORSEO_API_PASSWORD not set in .env\x1b[0m")
        console.warn("  → Falling back to LLM-only question generation (no real PAA data).")
      } else {
        const countryMap: Record<string, string> = {
          "us": "United States", "gb": "United Kingdom", "ca": "Canada", "au": "Australia",
          "in": "India", "de": "Germany", "fr": "France", "it": "Italy", "es": "Spain",
          "br": "Brazil", "mx": "Mexico", "jp": "Japan", "cn": "China", "ru": "Russia",
          "za": "South Africa", "sa": "Saudi Arabia", "ae": "United Arab Emirates",
          "nl": "Netherlands", "se": "Sweden", "no": "Norway", "dk": "Denmark",
          "fi": "Finland", "pl": "Poland", "ch": "Switzerland", "at": "Austria",
          "ie": "Ireland", "nz": "New Zealand", "sg": "Singapore", "hk": "Hong Kong",
          "my": "Malaysia", "id": "Indonesia", "th": "Thailand", "ph": "Philippines",
          "vn": "Vietnam", "kr": "South Korea", "tr": "Turkey", "ua": "Ukraine",
          "ar": "Argentina", "co": "Colombia", "cl": "Chile", "pe": "Peru",
          "ve": "Venezuela", "pk": "Pakistan", "bd": "Bangladesh", "eg": "Egypt",
          "ng": "Nigeria", "ke": "Kenya"
        }
        const langMap: Record<string, string> = {
          "en": "English", "es": "Spanish", "fr": "French", "de": "German",
          "it": "Italian", "pt": "Portuguese", "nl": "Dutch", "ja": "Japanese",
          "zh": "Chinese", "ru": "Russian", "ar": "Arabic", "hi": "Hindi",
          "ko": "Korean", "tr": "Turkish", "pl": "Polish", "sv": "Swedish",
          "no": "Norwegian", "fi": "Finnish", "da": "Danish", "el": "Greek",
          "he": "Hebrew", "id": "Indonesian", "ms": "Malay", "th": "Thai",
          "vi": "Vietnamese", "uk": "Ukrainian"
        }
        const locationName = countryMap[country] || "United States"
        const languageName = langMap[language] || "English"

        console.log("  ┌─ API Login         :", login)
        console.log("  ├─ Auth Method       : Basic (base64 login:password)")
        console.log("  ├─ Endpoint          : /v3/serp/google/organic/live/advanced")
        console.log("  ├─ Keyword           :", consumer_query)
        console.log("  ├─ Location (gl)     :", locationName)
        console.log("  ├─ Language (hl)     :", languageName)
        console.log("  └─ PAA Click Depth   : 2")

        const stage3Start = Date.now()

        try {
          const auth = Buffer.from(`${login}:${password}`).toString("base64")

          const dataForSeoPayload = [{
            keyword: consumer_query,
            location_name: locationName,
            language_name: languageName,
            device: "desktop",
            os: "windows",
            people_also_ask_click_depth: 2
          }]
          console.log("  → Request payload  :", JSON.stringify(dataForSeoPayload[0]))

          const response = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(dataForSeoPayload)
          })

          console.log(`  → DataForSEO HTTP Status: ${response.status} ${response.statusText}`)

          if (response.ok) {
            const resJson = await response.json()
            const task = resJson?.tasks?.[0]
            const taskResult = task?.result?.[0]
            const items = taskResult?.items || []

            console.log(`  → Task status       : ${task?.status_message || "unknown"}`)
            console.log(`  → Total SERP items  : ${items.length}`)
            console.log(`  → Item types found  : ${Array.from(new Set(items.map((i: any) => i.type))).join(", ")}`)

            const paaElement = items.find((item: any) => item.type === "people_also_ask")
            const paaQuestions = paaElement && Array.isArray(paaElement.items)
              ? paaElement.items.map((item: any) => item.title).filter(Boolean)
              : []

            const organicElements = items.filter((item: any) => item.type === "organic")
            const organicTitles = organicElements.map((item: any) => item.title).filter(Boolean)

            const relatedElements = items.filter((item: any) => item.type === "related_searches")
            const relatedQueries = relatedElements.flatMap((item: any) => {
              if (Array.isArray(item.items)) {
                return item.items.map((r: any) => typeof r === "string" ? r : r.title || r.query)
              }
              return []
            }).filter(Boolean)

            scrapedPAAQuestions = [
              ...paaQuestions,
              ...organicTitles,
              ...relatedQueries
            ]

            console.log(`\x1b[32m[STEP 3] ✓ GOOGLE SEARCH DATA SCRAPED (${Date.now() - stage3Start}ms) — ${scrapedPAAQuestions.length} items found\x1b[0m`)
            console.log(`  ├─ PAA Questions    : ${paaQuestions.length}`)
            console.log(`  ├─ Organic Titles   : ${organicTitles.length}`)
            console.log(`  └─ Related Queries  : ${relatedQueries.length}`)

            if (scrapedPAAQuestions.length > 0) {
              scrapedPAAQuestions.forEach((q, i) => console.log(`  [${i + 1}] ${q}`))
            } else {
              console.warn("\x1b[33m[STEP 3] ⚠ No organic, PAA, or related searches items found.\x1b[0m")
            }
          } else {
            const errText = await response.text()
            console.error(`\x1b[31m[STEP 3] ✗ DataForSEO error (${Date.now() - stage3Start}ms): ${response.status}\x1b[0m`)
            console.error("  → Response body:", errText.slice(0, 300))
          }
        } catch (dataForSeoErr: any) {
          console.error(`\x1b[31m[STEP 3] ✗ DataForSEO exception:\x1b[0m`, dataForSeoErr?.message || dataForSeoErr)
        }
      }
    }

    // ── STAGE 4: LLM SYNTHESIS ───────────────────────────────────────────────
    let autocompleteSuggestions: string[] = []
    try {
      autocompleteSuggestions = await autocompletePromise
    } catch (err: any) {
      console.warn("  ⚠ Autocomplete suggestions failed to resolve:", err?.message || err)
    }

    const actualThreadsAnalyzed = redditSources.length
    const hasPAAData = scrapedPAAQuestions.length > 0 || autocompleteSuggestions.length > 0
    const questionSource = hasPAAData ? "REAL GOOGLE DATA (PAA / Autocomplete) + LLM synthesis" : "LLM-ONLY (no real search data!)"

    console.log(`\n\x1b[36m[STEP 4] LLM SYNTHESIS — Calling LLM ${model}...\x1b[0m`)
    console.log("  ┌─ Model              :", model)
    console.log("  ├─ Reddit sources     :", redditSources.length, "threads passed")
    console.log("  ├─ PAA questions      :", scrapedPAAQuestions.length, "real questions passed")
    console.log("  ├─ Autocomplete suggs :", autocompleteSuggestions.length, "real suggestions passed")
    console.log("  ├─ threads_analyzed   :", actualThreadsAnalyzed, "(dynamic, not hardcoded)")
    console.log(`  ├─ Question source    : \x1b[${hasPAAData ? '32' : '33'}m${questionSource}\x1b[0m`)
    console.log("  └─ Output target      : 30-40 questions + 10 bonus topics")

    if (!hasPAAData) {
      console.warn(`\x1b[33m  ⚠ WARNING: ${providerToUse === "serper" ? "Serper.dev" : "DataForSEO"} returned 0 PAA questions.\x1b[0m`)
      console.warn("  ⚠ ALL questions below will be LLM-fabricated, NOT from real Google search data.")
      console.warn(`  ⚠ To fix: verify your ${providerToUse === "serper" ? "Serper.dev API key" : "DataForSEO account at https://app.dataforseo.com/"}`)
    }

    const stage4Start = Date.now()

    const synthesisPrompt = `You analyze how real people search Google.

You are NOT an SEO strategist.
You are NOT a content marketer.
You are NOT a blog writer.
You are NOT a consultant.

Your job is to reconstruct authentic search behavior from:

- Reddit discussions
- Google PAA questions
- Related searches
- Autocomplete suggestions

Generate questions exactly as real customers would type them into Google.

The searcher is usually:

The searcher is usually:

- trying to solve a problem
- trying to compare options
- trying to avoid a mistake
- trying to switch tools
- trying to learn something
- trying to validate an idea
- trying to find alternatives
- trying to troubleshoot
At least 50% of generated questions must come from:

- beginner intent
- comparison intent
- migration intent
- troubleshooting intent
- alternatives intent

Do not over-focus on hiring, agencies, pricing, or vendors.
If a question sounds like:
- a blog title
- a consultant recommendation
- a content marketing topic
- a product management discussion

reject it.

Keep only questions that sound like real searches.

Our Brand Persona Profile: "${persona}"
Our Target Customer (ICP): "${icp}"

The user's business niche query is: "${query}"
We have fetched these Reddit discussions:
${JSON.stringify(redditSources, null, 2)}

We scraped the following real questions, organic search result titles, and Google related searches searchers ask about "${consumer_query}":
${JSON.stringify(scrapedPAAQuestions, null, 2)}

We also fetched these Google Autocomplete search suggestions representing actual queries real users typed into Google:
${JSON.stringify(autocompleteSuggestions, null, 2)}`

    console.log("\n\x1b[33m┌────────────────────────────────────────────────────────┐\x1b[0m")
    console.log("\x1b[33m│            [STEP 4] SYNTHESIS PROMPT SENT TO LLM       │\x1b[0m")
    console.log("\x1b[33m└────────────────────────────────────────────────────────┘\x1b[0m")
    console.log(synthesisPrompt)
    console.log("\x1b[33m├────────────────────────────────────────────────────────┤\x1b[0m\n")

    const fullSynthesisPrompt = `${synthesisPrompt}

Your task is to generate a comprehensive, structured response matching this exact schema:
{
  "business": "string",
  "cached": false,
  "status": "complete",
  "threads_analyzed": ${actualThreadsAnalyzed},
  "subreddits": ["string"],
  "sources": [{ "subreddit": "string", "title": "string", "url": "string" }],
  "grounded_questions": [
    {
      "source_type": "reddit | paa | related_search | autocomplete",
      "source_title": "string",
      "pain_point": "string",
      "question": "string (Title Case format, e.g. 'How Much Does It Cost to Build a Laundry App?')",
      "search_intent": "string (A descriptive phrase, e.g. 'Budget planning for app development')",
      "geo_strategy": "string",
      "category_bucket": "Pricing | Timeline | Hiring | Vendor Selection | Validation | Competition | Maintenance | Features | Launch | Risk"
    }
  ],
  "bonus_topics": ["string"]
}

Rules:
1. Generate only evidence-backed questions.

Preferred range:
30-40 questions.

If evidence only supports 16 strong questions:
return 16.

Never generate filler.

Never generate placeholder questions.

Never create extra questions just to reach a target count.
2. Every generated question MUST be directly inspired by and grounded in a specific Reddit thread title, Google PAA question, Google related search, or Autocomplete suggestion provided in the context. Map these sources in the "source_type" and "source_title" fields.
3. REALISTIC SEARCH FORMATTING

The generated questions must look exactly like actual Google queries or PAA (People Also Ask) questions. 
They should be formal yet highly practical, formatted in Title Case.

Prefer descriptive search intent labels instead of single words. 
Example intents: "Budget planning for app development", "Finding developers or agencies", "Selecting the right partner".

Good Question Examples:
- "How Much Does It Cost to Build a Laundry App?"
- "Can I Hire Someone to Build My Laundry App?"
- "How to Choose a Mobile App Development Agency"
- "What Questions Should I Ask My App Developer?"

Avoid generic topics:
- role of
- importance of
- latest trends
- best practices
- frameworks
- methodologies
- strategic roadmaps
- industry analysis
- market overview
4. Enforce natural, conversational customer voice. Banish generic, robotic, and consultant-like templates.
   - STRICTLY REJECT questions containing these phrases unless the exact wording literally exists in the source evidence: 'role of', 'importance of', 'benefits of', 'latest trends', 'best practices', 'methodology', 'framework', 'technology stack', 'optimization', 'user engagement', 'retention metrics', 'implementation strategy'.
   - PREFER natural queries typed by real customers/buyers.
     * Bad (PM/Consultant style): "What criteria should I consider when choosing a mobile app development company?"
       Good (Customer style): "What Questions Should I Ask Before Hiring an App Developer?" or "How Do I Know If an App Developer Is Qualified?"
     * Bad: "What are the benefits of outsourcing mobile app development?"
       Good: "Should I Hire an App Developer or an Agency?" or "Should I Hire a Startup or Established App Development Company?"
     * Bad: "What are the costs associated with maintaining a mobile app?"
       Good: "How Much Should I Budget for App Development?" or "How to Negotiate App Development Costs"
     * Bad: "How to optimize pet care app for better user experience?"
       Good: "What features does a successful pet care app need?" or "How to build a dog walking app like Rover?"
     * Bad: "What is the difference between native and hybrid development?"
       Good: "What's the Difference Between Native and Cross-Platform App Development?"
   - Do NOT pollute the general questions with custom brand offerings (like "AI and machine learning features", "LMS", etc.) unless the user's business query specifically relates to them. Focus purely on the niche itself.
5. STRICTLY NO REPETITION / REDUNDANCY: Keep only the single strongest version of any semantically similar questions (concept similarity > 80%).
6. Category Diversity: Classify questions into the 10 buckets specified in the schema. Limit any single bucket to approximately 15% of the total questions (e.g., max 3-4 questions in any single category) to force broad coverage across pricing, timelines, hiring, mistakes, validation, maintenance, and alternatives.
7. Generate exactly 10 bonus_topics. These MUST be derived ONLY from recurring Reddit pain points, PAA questions, or related searches in the context.
   - NEVER generate generic SEO/agency blog categories (e.g., 'The Role of AI in...', 'Best Practices for...', 'Industry Trends...', 'Importance of Testing...').
   - Instead, make them reflect real, practical user problems and operational details (e.g. 'pet care app monetization strategies', 'building trust in pet care marketplaces', 'app development payment structures (fixed vs. hourly)', 'portfolio review tips for evaluating developers', 'how to manage an app development project as a non-technical founder', 'how to brief a developer on your app idea', 'remote app development team management').
8. Return ONLY raw JSON. No markdown, no code fences.`

    const synthesisText = await callLLM({
      userPrompt: fullSynthesisPrompt,
      model: model,
      jsonMode: true
    })

    const parsedReport = cleanAndParseJSON(synthesisText)

    // NLP Jaccard similarity helper with stopwords filtering and root tokenization
    const nlpStopWords = new Set([
      "how", "much", "does", "what", "are", "the", "with", "using", "really", "associated",
      "what", "where", "when", "why", "who", "whom", "this", "that", "these", "those",
      "should", "would", "could", "will", "shall", "can", "may", "might", "must",
      "have", "has", "had", "been", "being", "were", "was", "are", "is", "was",
      "and", "but", "for", "out", "off", "our", "your", "their", "about", "there",
      "here", "some", "any", "all", "more", "most", "less", "least", "best", "good",
      "bad", "better", "worse", "like", "such", "than", "then", "very", "too", "own"
    ])

    const dynamicStopWords = new Set([...nlpStopWords])
    const queryAndEntityWords = `${query} ${core_entity || ""}`.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2)
    queryAndEntityWords.forEach(w => {
      dynamicStopWords.add(w)
      if (w.endsWith("s")) dynamicStopWords.add(w.slice(0, -1))
      if (["pet", "pets", "dog", "dogs", "cat", "cats", "vet", "veterinary", "animal", "animals"].includes(w)) {
        dynamicStopWords.add("pet_root")
      }
      if (["builder", "builders", "build", "building", "develop", "developing", "development", "create", "creating", "make", "making"].includes(w)) {
        dynamicStopWords.add("build_root")
      }
    })

    const getNormalizedTokens = (str: string): Set<string> => {
      const words = str.toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2 && !dynamicStopWords.has(w))

      const normalized = words.map(w => {
        // Cost roots
        if (["cost", "costs", "price", "prices", "pricing", "budget", "budgeting", "rate", "rates", "fee", "fees", "charge", "charges", "expensive", "cheap", "cheapest", "pay", "paying"].includes(w)) {
          return "cost_root"
        }
        // Alt roots
        if (["alternative", "alternatives", "vs", "compare", "comparison", "comparisons", "comparable", "competitor", "competitors", "replace", "replacement"].includes(w)) {
          return "alt_root"
        }
        // Build roots
        if (["builder", "builders", "build", "building", "develop", "developing", "development", "create", "creating", "make", "making", "setup", "setting", "start", "starting"].includes(w)) {
          return "build_root"
        }
        // Hire roots
        if (["freelancer", "freelancers", "agency", "agencies", "company", "companies", "firm", "firms", "developer", "developers", "contractor", "contractors", "hire", "hiring", "team", "teams", "someone"].includes(w)) {
          return "hire_root"
        }
        // Pet care roots
        if (["pet", "pets", "dog", "dogs", "cat", "cats", "vet", "veterinary", "animal", "animals"].includes(w)) {
          return "pet_root"
        }
        return w
      })

      return new Set(normalized)
    }

    const calculateSimilarity = (str1: string, str2: string): number => {
      const s1 = getNormalizedTokens(str1)
      const s2 = getNormalizedTokens(str2)
      if (s1.size === 0 || s2.size === 0) return 0
      const intersection = new Set([...s1].filter(x => s2.has(x)))
      const union = new Set([...s1, ...s2])
      return intersection.size / union.size
    }

    const bannedKeywords = [
      "role of",
      "importance of",
      "latest trends",
      "current trends",
      "industry trends",
      "market trends",
      "future of",
      "best practices",
      "methodology",
      "framework",
      "technology stack",
      "optimization",
      "user engagement",
      "retention metrics",
      "implementation strategy",
      "key stages",

      "step-by-step guide",
      "comprehensive guide",
      "ultimate guide",
      "digital transformation",
      "growth strategy",
      "strategic roadmap",
      "feature roadmap",
      "success factors",
      "competitive landscape",
      "user acquisition",
      "industry outlook",
      "market analysis",
      "modern solutions"
    ]

    // Create a haystack of all source evidence for strict customer voice phrase validation
    const sourceEvidenceText = [
      ...redditSources.map(s => `${s.title} ${s.subreddit}`),
      ...scrapedPAAQuestions,
      ...autocompleteSuggestions
    ].join(" ").toLowerCase()

    const validatedQuestions: any[] = []
    const bucketCounts: Record<string, number> = {}

    const rawGrounded = parsedReport.grounded_questions || parsedReport.questions || []
    const intentCounts: Record<string, number> = {}
    for (const gq of rawGrounded) {
      if (!gq || typeof gq !== "object") continue

      const questionText = gq.question || gq.q || gq.title || ""
      if (!questionText || !questionText.includes("?")) continue

      // Priority 1: Customer Voice Filter (Reject banned keywords unless literally in evidence)
      let hasBannedWord = false
      const qLower = questionText.toLowerCase()
      for (const banned of bannedKeywords) {
        if (qLower.includes(banned)) {
          if (!sourceEvidenceText.includes(banned)) {
            hasBannedWord = true
            break
          }
        }
      }
      if (hasBannedWord) {
        console.log(`  [Reject Banned Phrase] "${questionText}"`)
        continue
      }

      // Priority 2: Deduplication (Jaccard similarity check against already accepted questions)
      let isDuplicate = false
      for (const aq of validatedQuestions) {
        if (calculateSimilarity(questionText, aq.question) > 0.75) {
          isDuplicate = true
          break
        }
      }
      if (isDuplicate) {
        console.log(`  [Reject Duplicate] "${questionText}"`)
        continue
      }

      // Priority 3: Diversity (Cap per category bucket - max 2 for first pass)
      const bucket = gq.category_bucket || "General"
      const currentCount = bucketCounts[bucket] || 0
      if (currentCount >= 20) {
        console.log(`  [Reject Bucket Cap] "${questionText}" in bucket "${bucket}"`)
        continue
      }

      // If it passes all checks, accept it
      bucketCounts[bucket] = currentCount + 1
      const intent =
        gq.search_intent || "Informational"

      const currentIntentCount =
        intentCounts[intent] || 0

      if (currentIntentCount >= 15) {
        console.log(
          `[INTENT CAP] ${intent}`
        )
        continue
      }

      intentCounts[intent] =
        currentIntentCount + 1

      validatedQuestions.push({
        question: questionText,
        search_intent: intent,
        geo_strategy:
          gq.geo_strategy ||
          "Structure your answer using a direct definition paragraph."
      })
    }

    // Fallback pass if strict filters left us with fewer than 20 questions
    if (validatedQuestions.length < 20) {
      console.log(`  [Post-processing] Only ${validatedQuestions.length} questions passed strict filters. Running fallback pass...`)
      for (const gq of rawGrounded) {
        if (validatedQuestions.length >= 40) break

        const questionText = gq.question || gq.q || gq.title || ""
        if (!questionText || !questionText.includes("?")) continue

        // Check if already accepted
        if (validatedQuestions.some(vq => vq.question === questionText)) continue

        // Still enforce banned keywords
        let hasBannedWord = false
        const qLower = questionText.toLowerCase()
        for (const banned of bannedKeywords) {
          if (qLower.includes(banned)) {
            if (!sourceEvidenceText.includes(banned)) {
              hasBannedWord = true
              break
            }
          }
        }
        if (hasBannedWord) {
          console.log(
            "[QUESTION REJECTED - BANNED]",
            questionText
          )
          continue
        }

        // Still enforce deduplication (slightly relaxed to 0.45)
        let isDuplicate = false
        for (const aq of validatedQuestions) {
          if (calculateSimilarity(questionText, aq.question) > 0.65) {
            isDuplicate = true
            break
          }
        }
        if (isDuplicate) {
          console.log(
            "[QUESTION REJECTED - DUPLICATE]",
            questionText
          )
          continue
        }

        // Relaxed bucket cap to 3 in fallback pass
        const bucket = gq.category_bucket || "General"
        const currentCount = bucketCounts[bucket] || 0
        if (currentCount >= 20) {
          console.log(
            "[QUESTION REJECTED - BUCKET]",
            questionText
          )
          continue
        }

        bucketCounts[bucket] = currentCount + 1
        const intent =
          gq.search_intent || "Informational"

        const currentIntentCount =
          intentCounts[intent] || 0

        if (currentIntentCount >= 15) {
          console.log(
            `[INTENT CAP] ${intent}`
          )
          continue
        }

        intentCounts[intent] =
          currentIntentCount + 1

        validatedQuestions.push({
          question: questionText,
          search_intent: intent,
          geo_strategy:
            gq.geo_strategy ||
            "Structure your answer using a direct definition paragraph."
        })
      }
    }

    // Slice to max 40 to respect the 30-40 questions preference
    const finalReport: FindQuestionsResponse = {
      business: query,
      cached: false,
      status: "complete",
      threads_analyzed: actualThreadsAnalyzed,
      subreddits: [],
      sources: redditSources.slice(0, 20),
      questions: validatedQuestions.slice(0, 40),
      bonus_topics: parsedReport.bonus_topics || []
    }

    // Defensive normalizer fallback generator if GEO strategy or search intent is missing/placeholder
    if (finalReport.questions && Array.isArray(finalReport.questions)) {
      finalReport.questions = finalReport.questions.map((q: any) => {
        let questionText = q.question || ""
        let intentText = q.search_intent || ""
        let geoText = q.geo_strategy || ""

        if (!intentText || intentText.length < 3) {
          const qLower = questionText.toLowerCase()

          if (
            qLower.includes("cost") ||
            qLower.includes("price") ||
            qLower.includes("fee") ||
            qLower.includes("budget") ||
            qLower.includes("charge")
          ) {
            intentText = "Pricing"
          } else if (
            qLower.includes("vs") ||
            qLower.includes("compare") ||
            qLower.includes("alternative") ||
            qLower.includes("better")
          ) {
            intentText = "Comparison"
          } else if (
            qLower.includes("hire") ||
            qLower.includes("agency") ||
            qLower.includes("developer") ||
            qLower.includes("freelancer")
          ) {
            intentText = "Vendor Evaluation"
          } else if (
            qLower.includes("mistake") ||
            qLower.includes("risk") ||
            qLower.includes("avoid")
          ) {
            intentText = "Risk Assessment"
          } else if (
            qLower.includes("how long") ||
            qLower.includes("timeline")
          ) {
            intentText = "Implementation"
          } else {
            intentText = "Problem Solving"
          }
        }

        if (!geoText || geoText.length < 8) {
          const qLower = questionText.toLowerCase()

          if (
            qLower.includes("cost") ||
            qLower.includes("price") ||
            qLower.includes("budget")
          ) {
            geoText =
              "show real pricing examples, cost breakdowns, and realistic budget ranges"
          }

          else if (
            qLower.includes("vs") ||
            qLower.includes("compare") ||
            qLower.includes("alternative") ||
            qLower.includes("better")
          ) {
            geoText =
              "compare options side by side with pros, cons, and real-world examples"
          }

          else if (
            qLower.includes("hire") ||
            qLower.includes("agency") ||
            qLower.includes("developer") ||
            qLower.includes("freelancer")
          ) {
            geoText =
              "provide evaluation checklists, hiring questions, and warning signs"
          }

          else if (
            qLower.includes("timeline") ||
            qLower.includes("how long")
          ) {
            geoText =
              "show realistic timelines using examples from real projects"
          }

          else {
            geoText =
              "answer using practical examples, screenshots, workflows, and real experiences"
          }
        }

        return {
          question: questionText,
          search_intent: intentText,
          geo_strategy: geoText
        }
      })
    }

    console.log(`\x1b[32m[STEP 4] ✓ SYNTHESIS DONE (${Date.now() - stage4Start}ms)\x1b[0m`)
    console.log("  ┌─ Questions generated :", finalReport.questions?.length || 0)
    console.log("  ├─ Bonus topics        :", finalReport.bonus_topics?.length || 0)

    const idealSubs = (target_subreddits || []).map((sub: string) => sub.replace(/^r\//i, ""))
    const combinedSubs: string[] = []
    const seenSubs = new Set<string>()

    const getNormKey = (sub: string) => {
      return sub.toLowerCase().trim()
    }

    idealSubs.forEach((sub: string) => {
      const key = getNormKey(sub)
      if (sub && !seenSubs.has(key)) {
        seenSubs.add(key)
        combinedSubs.push(sub)
      }
    })

    // Prefix subreddits with r/ and cap at 8 to prevent UI clutter
    finalReport.subreddits = combinedSubs.map(s => s.startsWith("r/") ? s : `r/${s}`).slice(0, 15)

    console.log("  └─ Subreddits in output:", JSON.stringify(finalReport.subreddits))

    const totalMs = Date.now() - startTime
    console.log("\n\x1b[35m╔══════════════════════════════════════════════════════╗\x1b[0m")
    console.log(`\x1b[35m║  ✓ PIPELINE COMPLETE — Total time: ${totalMs}ms`.padEnd(56) + "║\x1b[0m")
    console.log(`\x1b[35m║  Questions: ${finalReport.questions.length} | Sources: ${finalReport.sources.length} | Topics: ${finalReport.bonus_topics.length}`.padEnd(56) + "║\x1b[0m")
    console.log("\x1b[35m╚══════════════════════════════════════════════════════╝\x1b[0m\n")

    return NextResponse.json(finalReport)

  } catch (error: any) {
    const totalMs = Date.now() - startTime
    console.error(`\x1b[31m\n[PIPELINE FAILED after ${totalMs}ms]:`, error?.message || error, "\x1b[0m")
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
