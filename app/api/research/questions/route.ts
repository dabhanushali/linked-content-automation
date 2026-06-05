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
  bonus_topics: string[]
  questions: PAAQuestion[]
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
- Only use generic software/business subreddits (like r/SaaS, r/startups, r/AppDevelopment, r/Entrepreneur, r/Upwork, r/freelance, r/software, r/coding) as a secondary fallback if the niche is too narrow.

SUBREDDIT CROSS-CONTAMINATION — NEVER mix industry subreddits:

If query is about ECOMMERCE:
Use: r/ecommerce, r/Shopify, r/WooCommerce, r/smallbusiness
NEVER use: r/restaurantowners, r/KitchenConfidential, r/foodservice

If query is about RESTAURANTS:
Use: r/restaurantowners, r/KitchenConfidential, r/FoodService  
NEVER use: r/ecommerce, r/Shopify, r/webdev (unless specifically about restaurant websites)

The subreddits must match the INDUSTRY of the query, not just the technology.

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
    const autocompletePromise = fetchGoogleAutocomplete(query, "");
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

    // Deduplicate sources by title similarity before passing to LLM
    const deduplicatedSources = redditSources.filter((source, index, self) => {
      return index === self.findIndex(s => {
        const titleA = s.title.toLowerCase().slice(0, 50)
        const titleB = source.title.toLowerCase().slice(0, 50)
        return titleA === titleB
      })
    })

    // Filter sources to only those relevant to the core query
    const relevantSources = deduplicatedSources.filter(source => {
      const titleLower = source.title.toLowerCase()
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      const coreEntityWords = (core_entity || "").toLowerCase().split(/\s+/).filter(w => w.length > 3)

      const allRelevantWords = [...queryWords, ...coreEntityWords]
      const matchCount = allRelevantWords.filter(word => titleLower.includes(word)).length

      return matchCount >= 1
    })

    // FALLBACK: if too few relevant sources, use all deduplicated sources
    const uniqueSources = relevantSources.length >= 5
      ? relevantSources
      : deduplicatedSources

    const fullSynthesisPrompt = `You are analyzing real search behavior for: "${query}"
Brand Persona: "${persona}"
Target Customer (ICP): "${icp}"

QUALITY ENFORCEMENT — READ THIS FIRST:

Every single question you generate MUST:
1. Start with a capital letter
2. End with a question mark
3. Follow proper Title Case (not all lowercase, not all caps)
4. Be a complete English question

If you find yourself writing lowercase questions or dropping question marks,
STOP and restart that question correctly.

There is NO acceptable reason to write lowercase questions.
"what is astro?" is ALWAYS wrong.
"What Is Astro?" is ALWAYS right.

This rule applies even if you are running low on space.
It is better to write 30 high-quality questions than 40 degraded ones.

If fewer than 8 Reddit sources are provided, compensate by generating MORE 
LLM-originated questions based on what buyers in this niche would realistically search.
The minimum question count of 35 NEVER changes regardless of source count.

REAL DATA COLLECTED:

Reddit discussions found:
\${JSON.stringify(uniqueSources, null, 2)}

Real Google PAA questions and related searches for "\${consumer_query}":
\${JSON.stringify(scrapedPAAQuestions, null, 2)}

Google Autocomplete suggestions (what real users typed):
\${JSON.stringify(autocompleteSuggestions, null, 2)}

---

TOPIC BOUNDARY — CRITICAL:

Every question MUST be about "${query}" only.
Before writing each question: "Would someone Googling '${query}' find this relevant?"
If NO — do not write it.

IGNORE any Reddit sources about different industries or unrelated topics.

---

QUERY TYPE RULES:

Identify which type "${query}" is, then apply those rules:

TYPE A — B2B SERVICE (e.g. "mobile app development", "ecommerce website development"):
The buyer is hiring someone. Focus on:
- Hiring decisions (freelancer vs agency)
- Cost and timeline
- Red flags and risks  
- What to ask before hiring
- What happens post-launch
- DIY vs professional

FOR TYPE B — TECHNICAL FRAMEWORK QUERIES:

The buyer searching "${query}" is ONE of these people:
A) A small business owner who heard about this framework and wants to know if it's worth it
B) A freelancer evaluating whether to learn this tool
C) A startup founder comparing frameworks for their project

Generate ALL questions from perspective A, B, or C ONLY.

BANNED for Type B:
- Questions about how to write code
- Questions about debugging or fixing errors  
- Questions about server configuration
- Questions about specific technical integrations
- Questions about backups, security configs, or devops

REQUIRED for Type B — use these specific question angles:
- "[Framework] vs [Alternative]: which should I choose?"
- "Is [Framework] good for [specific use case like SEO/ecommerce/blogs]?"
- "How much does a [Framework] developer cost?"
- "How long to build a [use case] with [Framework]?"
- "Is [Framework] better than WordPress for my business?"
- "Can I edit my [Framework] site without a developer?"
- "Should I learn [Framework] or just use WordPress?"
- "Is [Framework] good for non-technical founders?"
- "Is [Framework] worth learning as a freelancer?"
- "Can I charge more for [Framework] than [Alternative]?"
- "Are clients asking for [Framework] sites yet?"

GOLD STANDARD for Astro questions:
"Is Astro Better Than WordPress for SEO?"
"How Much Does an Astro Developer Cost per Hour?"
"Can I Update an Astro Site Without Coding?"
"Astro vs Webflow: Which Is Cheaper to Maintain?"
"Is Astro Good for a Small Business Website?"
"Should I Learn Astro or Stick With WordPress?"
"How Fast Is an Astro Site Compared to WordPress?"
"Can My Client Edit Their Astro Website Themselves?"
"Is Astro Worth Learning for Freelancers in 2025?"
"What Kind of Sites Is Astro Actually Built For?"
"Is Astro Worth Learning as a Freelancer?"
"Can I Charge More for Astro Websites Than WordPress?"
"Why Are Freelancers Switching From WordPress to Astro?"

TYPE C — SOFTWARE PRODUCT (e.g. "inventory software", "CRM system"):
The buyer is evaluating software to purchase/use. Focus on:
- Comparing specific named products (Product A vs Product B)
- Daily operational use cases
- Staff training and adoption
- Cost and hidden fees
- Integration with existing systems
- What happens when it goes down

TYPE D — CONSUMER APP (e.g. "fitness tracker", "meditation app"):
The buyer is an end user. Focus on:
- How to use it
- Comparing apps
- Pricing and fees
- Safety and trust
- Features they care about

"${query}" is TYPE: [determine this yourself based on the query]

---

MANDATORY QUESTION RULES:

RULE 1 — TITLE CASE (proper, not all-caps):
Capitalize: nouns, verbs, adjectives, adverbs, first word
Lowercase: a, an, the, and, but, or, for, nor, on, at, to, by, in, of, vs
WRONG: "What Is The Best Software For Small Businesses?"
RIGHT: "What's the Best Software for Small Businesses?"
WRONG: "How Do I Choose The Right Platform?"
RIGHT: "How Do I Choose the Right Platform?"
The query phrase "${query}" follows normal Title Case rules inside questions.
WRONG: "Is Custom software development Dead?"
RIGHT: "Is Custom Software Development Dead?"

RULE 2 — BUYER POV ONLY, NEVER DEVELOPER POV:
The target audience is a non-technical Founder/Business Owner hiring an agency or evaluating a tool.
They DO NOT write code. They DO NOT debug.

BANNED developer questions:
- "How to integrate [Tech/API/Hardware]?"
- "Why is [Coding Task] so difficult?"
- "How do I fix [Bug/Crash/Error]?"
- "What is the best database for my project?"
- "What Tech Stack Should I Use?"
- "How Do I Write a Functional Requirement Document?"
- "Is Python Good for This Project?"
- "How Does Serverless Architecture Work?"
- "What Are the Differences Between Front End and Back End?"

RULE 3 — BANNED QUESTION PATTERNS (reject any matching these):
- "What Are the Best [X] Tips/Tools/Trends/Practices?"
- "What Is the [X] Process?"
- "The Role of [X] in [Y]"
- "The Importance of [X]"
- "What Are the Benefits of [X]?" (too generic — make it specific)
- "What Are the Advantages of [X]?" (too generic)
- "How Does [X] Support [Y]?" (sounds like documentation)
- "What Are the Career Opportunities in [X]?"
- Any question that sounds like a Wikipedia section heading

RULE 4 — UNIQUE search_intent PER QUESTION:
Every search_intent must start with a DIFFERENT verb.
Must be 4-8 plain English words describing buyer's real goal.
BAD: "Astro Benefits" (too short, category label)
BAD: "Understanding the benefits of pos systems" (generic)
GOOD: "checking if monthly fees are worth it"
GOOD: "worried about losing data during migration"
GOOD: "comparing costs before making a decision"
Banned opener: "trying to figure out" — never use this phrase.

RULE 5 — NATURAL CONVERSATIONAL ENTITY NAMING:
NEVER paste the exact literal phrase "${query}" into every question! That sounds robotic.
Instead, use natural, conversational shorthand that a buyer would actually use.
Vary what you call the product/service in every question (e.g. use "the app", "the software", "a developer", "an agency", "the platform", "this framework").

Example for query "ecommerce website development":
BAD: "How Much Does Ecommerce Website Development Cost?"
GOOD: "How Much Does a Custom Online Store Cost?"
GOOD: "How Much Do Ecommerce Developers Charge?"

Example for query "ai agent development service":
BAD: "Is AI Agent Development Service Worth It?"
GOOD: "Are Custom AI Agents Worth It?"
GOOD: "Do I Need to Hire an AI Agency?"

RULE 6 — FEAR FRAMING RULE:
When writing "What Happens if My [person] disappears/quits/goes silent" — the timing must be DURING the project, not after.
"After launch" removes the fear entirely.
Always use: "mid-project", "halfway through", "before finishing", "during development", or no timing qualifier at all.

---

MANDATORY BUYER JOURNEY — include at least 2 per category:

1. AWARENESS: "Do I even need this? What is it?"
2. COST/BUDGET: "How much? Hidden fees? Can I afford it?"
3. COMPARISON: "X vs Y — specific named products"
4. TIMELINE: "How long does it take?"
5. HIRING/VENDOR: "Who do I trust? Red flags?"
6. DIY vs PRO: "Can I do this myself?"
7. POST-LAUNCH: "What happens after? Maintenance costs?"
8. RISK: "What if X goes wrong? How do I protect myself?"
9. FEATURES: "What do I actually need vs nice-to-have?"
10. TROUBLESHOOTING: "Why is X broken? How do I fix Y?"
11. FEATURE EDUCATION: "How does [specific named feature] work?" or "What is [specific component] and do I need it?"

---

15 MANDATORY QUESTION FRAMES:
Use these exact syntactic frames for your questions:

1. "Can X Really Do Y?" (e.g. Can [thing] Really [benefit]?)
2. "Do I Really Need X?" (e.g. Do I Really Need [product]?)
3. "What Happens if X Goes Wrong?" (e.g. What Happens if [thing] [failure scenario]?)
4. "What's the Best X for [Specific Situation]?"
5. "How Do I Know if X?" (e.g. How Do I Know if/when [situation]?)
6. "X vs Y: Which Is Better/Cheaper/Right for Me?"
7. "Should I [Action] or [Alternative Action]?"
8. "How Much Does/Is X?"
9. "Can I Do X Without Y?" (e.g. Can I [goal] Without [thing to avoid]?)
10. "Why Is X So [Negative Adjective]?"
11. "Why Is X So Hard/Expensive?"
12. "What Do I Actually Need?" (e.g. What [things] Do I Actually Need?)
13. "Is X Worth It for [Specific Context]?"
14. "How Long Does X Take?"
15. "What If My [Person/Thing] [Fails/Disappears/Stops]?"

MASTER FORMULA:
[Emotional trigger word] + [Specific named thing] + [Buyer's real situation]
Top triggers: Really, Actually, If, Without, Worth

---

EMOTIONAL PATTERN CHECKLIST — include at least 3 questions per pattern:

1. SCAM FEAR: "red flags", "warning signs", "safely", "trust", "disappear"
2. HIDDEN COST FEAR: "hidden fees", "after launch", "ongoing", "maintenance", "really costs"  
3. OWNERSHIP FEAR: "who owns", "do I own", "locked in", "access", "control"
4. TIME FEAR: "how long", "fastest", "launch", "deadline", "quickly"
5. ROI DOUBT: "worth it", "really", "save money", "actually need", "justify"
6. FAILURE FEAR: "what if", "what happens if", "breaks", "crashes", "goes down"
7. DIY DOUBT: "can I", "myself", "without coding", "alone", "no-code"
8. COMPARISON PARALYSIS: "vs", "or", "which is better", "difference between"

The best questions combine TWO patterns.
Aim for at least 5 questions that hit two patterns simultaneously.

---

OUTPUT STRUCTURE — generate in this EXACT order:

{
  "business": "${query}",
  "cached": false,
  "status": "complete",
  "threads_analyzed": \${actualThreadsAnalyzed},
  "subreddits": [],
  "sources": \${JSON.stringify(uniqueSources.slice(0, 20))},
  "bonus_topics": [
    "10 specific actionable blog post titles here — generate FIRST"
  ],
  "questions": [
    {
      "question": "Title Case question ending with ?",
      "search_intent": "unique 4-8 word buyer goal description"
    }
  ]
}

QUANTITY:
- bonus_topics: EXACTLY 10 — generate BEFORE questions
- questions: EXACTLY 35-40

BONUS TOPICS RULES:
Specific, actionable blog titles covering angles NOT in the questions.

bonus_topics MUST be blog post or article TITLES — not questions.
They should read like headlines, not search queries.

WRONG FORMAT (questions):
"What's the Best CRM for Real Estate Teams on a Budget?"
"Why Are Real Estate CRMs So Expensive?"

CORRECT FORMAT (titles):
"What the Best Real Estate CRMs Have in Common"
"Why Your Real Estate CRM Fails During Peak Season"
"The Hidden Costs Nobody Tells You About Property Management Software"
"Moving From Yardi to a Custom CRM: What You Actually Lose"
"When Cheap Listing Platforms Cost You More Than Premium Ones"

Notice: titles make a statement or promise. Questions make a query.
A title draws someone to read. A question looks like a search result.

BONUS TOPICS BANNED PATTERNS — never use these in bonus_topics:
- "The Benefits of..."
- "The Role of..."  
- "The Impact of..."
- "The Importance of..."
- "10 Essential..."
- "Creating a Seamless..."
- Any title that sounds like a LinkedIn article

GOOD bonus_topics sound like they solve a specific problem:
"Moving From Toast to Square: What You Lose and Gain"
"Why Your POS Slows Down During Rush Hour"
"What to Do When Your Developer Disappears"
"Hidden Fees in Payment Gateways Nobody Warns You About"

FINAL COUNT CHECK before closing JSON:
□ bonus_topics = exactly 10?
□ questions = 35-40?
□ Proper Title Case (not every word capitalized)?
□ Every search_intent unique and starts with different word?
□ At least 2 questions per buyer journey category?

Return ONLY raw JSON. No markdown. No code fences. No explanation.`

    console.log("\\n\\x1b[33m┌────────────────────────────────────────────────────────┐\\x1b[0m")
    console.log("\\x1b[33m│            [STEP 4] SYNTHESIS PROMPT SENT TO LLM       │\\x1b[0m")
    console.log("\\x1b[33m└────────────────────────────────────────────────────────┘\\x1b[0m")
    console.log(fullSynthesisPrompt)
    console.log("\\x1b[33m├────────────────────────────────────────────────────────┤\\x1b[0m\\n")
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

    const dynamicStopWords = new Set([...nlpStopWords]);
    const queryAndEntityWords = `${query}`.toLowerCase()
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

    // Skeleton Template Deduplication Helper
    const getQuestionSkeleton = (q: string) => {
      return q.toLowerCase()
        .replace(/\b(astro|healthcare|ai agent|mobile app|restaurant|ecommerce)\b/gi, 'TOPIC')
        .replace(/\b(blockchain|iot|vr|nlp|machine learning|gamification|voice|flutter|react native)\b/gi, 'TECH')
        .replace(/\b(develop|build|create|integrate|implement)\b/gi, 'BUILD')
    }
    const seenSkeletons = new Set<string>()

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

      // Reject questions that are just definitions without a buyer context
      const definitionOnlyPattern = /^what is (a|an|the) [a-z\s]+\?$/i
      if (definitionOnlyPattern.test(questionText) && !questionText.includes("and")) {
        console.log(`  [Reject Bare Definition] "${questionText}"`)
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

      // Priority 3: Skeleton Template Deduplication
      const skeleton = getQuestionSkeleton(questionText)
      if (seenSkeletons.has(skeleton)) {
        console.log(`  [Reject Template Duplicate] "${questionText}"`)
        continue
      }
      seenSkeletons.add(skeleton)

      // If it passes all checks, accept it
      const intent = gq.search_intent || "Informational"

      const currentIntentCount = intentCounts[intent] || 0
      if (currentIntentCount >= 4) {
        console.log(`[INTENT CAP] ${intent}`)
        continue
      }
      intentCounts[intent] = currentIntentCount + 1

      validatedQuestions.push({
        question: questionText,
        search_intent: intent
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
          console.log("[QUESTION REJECTED - BANNED]", questionText)
          continue
        }

        // Still enforce deduplication (slightly relaxed to 0.65)
        let isDuplicate = false
        for (const aq of validatedQuestions) {
          if (calculateSimilarity(questionText, aq.question) > 0.65) {
            isDuplicate = true
            break
          }
        }
        if (isDuplicate) {
          console.log("[QUESTION REJECTED - DUPLICATE]", questionText)
          continue
        }

        // Priority 3: Skeleton Template Deduplication
        const skeleton = getQuestionSkeleton(questionText)
        if (seenSkeletons.has(skeleton)) {
          console.log(`[QUESTION REJECTED - TEMPLATE DUPLICATE] "${questionText}"`)
          continue
        }
        seenSkeletons.add(skeleton)

        const intent = gq.search_intent || "Informational"

        const currentIntentCount = intentCounts[intent] || 0
        if (currentIntentCount >= 4) {
          console.log(`[INTENT CAP] ${intent}`)
          continue
        }
        intentCounts[intent] = currentIntentCount + 1

        validatedQuestions.push({
          question: questionText,
          search_intent: intent
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
      sources: uniqueSources.slice(0, 20),
      bonus_topics: parsedReport.bonus_topics || [],
      questions: validatedQuestions.slice(0, 40)
    }

    // Defensive normalizer fallback generator if GEO strategy or search intent is missing/placeholder
    if (finalReport.questions && Array.isArray(finalReport.questions)) {
      finalReport.questions = finalReport.questions.map((q: any) => {
        let questionText = q.question || ""
        let intentText = q.search_intent || ""
        let geoText = q.content_angle || q.geo_strategy || ""

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

        return {
          question: questionText,
          search_intent: intentText
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
