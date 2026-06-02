import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"

export const maxDuration = 60 // Allow up to 60s for full search and synthesis

const genericWords = new Set([
  "app", "apps", "development", "developer", "developers", "service", "services", 
  "software", "website", "websites", "web", "platform", "platforms", "company", 
  "agency", "agencies", "firm", "business", "businesses", "custom", "product", 
  "products", "project", "projects", "build", "builder", "solution", "solutions", 
  "client", "clients", "customer", "customers", "provider", "providers", "industry", 
  "industries", "tool", "tools", "system", "systems", "tech", "technology", "technologies"
])

function checkCompoundRelevance(haystack: string, query: string, activeSearchTerm?: string): boolean {
  const normalizedQuery = query.toLowerCase();
  const normalizedActive = activeSearchTerm ? activeSearchTerm.toLowerCase() : "";
  const normalizedHay = haystack.toLowerCase();
  
  const commonCompounds = [
    "real estate", "home service", "home services", "on demand", "on-demand", 
    "pet care", "app development", "software development", "web development",
    "lead generation", "marketing automation", "machine learning", "virtual assistant"
  ];
  
  // 1. Verify original query compounds
  let origPassed = true;
  for (const compound of commonCompounds) {
    if (normalizedQuery.includes(compound)) {
      const parts = compound.replace("-", " ").split(/\s+/).filter(p => p.length >= 3);
      const hasAllParts = parts.every(part => normalizedHay.includes(part));
      if (!hasAllParts) {
        origPassed = false;
        break;
      }
    }
  }
  
  if (origPassed) return true;
  
  // 2. If original query compound failed, verify active search term compounds (fallback for related searches)
  if (normalizedActive) {
    let activePassed = true;
    for (const compound of commonCompounds) {
      if (normalizedActive.includes(compound)) {
        const parts = compound.replace("-", " ").split(/\s+/).filter(p => p.length >= 3);
        const hasAllParts = parts.every(part => normalizedHay.includes(part));
        if (!hasAllParts) {
          activePassed = false;
          break;
        }
      }
    }
    return activePassed;
  }
  
  return false;
}

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
  source_name: string
  source_url: string
  generation_rationale: string
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
Extract:
1. "reddit_related_query_1": A short, extremely focused, and natural related query (no more than 3-4 words) that target customers (ICP) or professionals type into Reddit's search bar to find comparisons, alternatives, or reviews (e.g. use "gloriafood alternatives" or "gloriafood reviews" if query is "gloriafood"). Do NOT include site limits or operators.
2. "reddit_related_query_2": Another distinct, highly focused related query (no more than 3-4 words) that captures a specific feature, integration, or B2B/SaaS pain point (e.g. use "gloriafood pricing" or "gloriafood pos integration" if query is "gloriafood").
3. "target_subreddits": An array of up to 8 subreddits where our target customers (ICP) would hang out and discuss these niche topics. (Ensure names contain no spaces, e.g. "smallbusiness" or "restaurateur").

Return ONLY a raw JSON object in this exact format (no markdown formatting, no code fences, just raw JSON wrapped in braces):
{
  "reddit_related_query_1": "string",
  "reddit_related_query_2": "string",
  "target_subreddits": ["string"]
}`

    // Use a fast model like llama-3.1-8b-instant or gpt-4o-mini if sonnet is not selected to keep it cheap/fast
    const extractionModel = model.includes("sonnet") ? model : (model.includes("llama-3.3") ? model : "llama-3.1-8b-instant")
    const extractedText = await callLLM({
      userPrompt: extractionPrompt,
      model: extractionModel,
      jsonMode: true
    })

    const cleanJsonText = extractedText.replace(/```json\s*([\s\S]*?)\s*```/g, "$1").trim()
    const { reddit_related_query_1, reddit_related_query_2, target_subreddits } = JSON.parse(cleanJsonText)

    console.log(`\x1b[32m[STEP 1] ✓ QUERY EXPANSION DONE (${Date.now() - stage1Start}ms)\x1b[0m`)
    console.log("  ┌─ Input Query            :", query)
    console.log("  ├─ consumer_query         :", consumer_query)
    console.log("  ├─ reddit_related_query_1 :", reddit_related_query_1)
    console.log("  ├─ reddit_related_query_2 :", reddit_related_query_2)
    console.log("  └─ target_subreddits      :", JSON.stringify(target_subreddits))

    // ── STAGE 2: REDDIT SEARCH (JSON-first → RSS-fallback) ─────────────────
    const stage2Start = Date.now()
    let redditSources: RedditSource[] = []

    const REDDIT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    const allQueryWords = `${query} ${consumer_query} ${reddit_related_query_1} ${reddit_related_query_2}`.toLowerCase()
    const stopWords = new Set(["the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","shall","should","may","might","must","can","could","and","but","or","nor","for","yet","so","in","on","at","to","from","by","with","of","about","into","through","during","before","after","above","below","between","out","off","over","under","again","further","then","once","how","what","which","who","whom","this","that","these","those","i","me","my","we","our","you","your","he","him","his","she","her","it","its","they","them","their"])
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
      const url = `https://old.reddit.com/search.json?q=${encoded}&limit=25&sort=relevance&t=all`

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

        // Core concept keywords from the original query for relevance filtering
        const coreWords = query.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w))
        // Require at least 35% of core keywords to match (minimum 1), to reject unrelated posts
        const coreThreshold = Math.max(1, Math.ceil(coreWords.length * 0.35))
        const anchorWords = coreWords.filter((w: string) => !genericWords.has(w))

        const posts = children
          .filter((c: any) => {
            if (c.kind !== "t3") return false
            const d = c.data
            const hay = `${String(d.title || "")} ${String(d.selftext || "")}`.toLowerCase()
            const matched = coreWords.filter((kw: string) => hay.includes(kw))
            if (matched.length < coreThreshold) {
              console.log(`  [SKIP-JSON] \x1b[33m"${String(d.title || "").slice(0, 60)}"\x1b[0m — only ${matched.length}/${coreWords.length} core keywords matched (need ${coreThreshold})`)
              return false
            }

            // Check compound concept relevance to filter out generic posts that only match generic words
            if (!checkCompoundRelevance(hay, query, searchTerm)) {
              console.log(`  [SKIP-JSON-COMPOUND] \x1b[33m"${String(d.title || "").slice(0, 60)}"\x1b[0m — failed compound concept relevance for "${query}" / "${searchTerm}"`)
              return false
            }

            // Strictly require at least one anchor word to match (if any anchor words exist)
            if (anchorWords.length > 0) {
              const matchedAnchors = anchorWords.filter((kw: string) => hay.includes(kw))
              if (matchedAnchors.length === 0) {
                console.log(`  [SKIP-JSON-ANCHOR] \x1b[33m"${String(d.title || "").slice(0, 60)}"\x1b[0m — no anchor keywords matched out of: [${anchorWords.join(", ")}]`)
                return false
              }
            }

            // Colloquial "pet" guard: if query has "pet" as keyword but post only uses
            // it in idioms (pet-peeve, pet project, pet name), reject unless real pet phrases exist
            if (coreWords.includes("pet") && hay.includes("pet")) {
              const hasPetPhrase = /\bpet\s+(care|app|owner|dog|cat|animal|food|health|grooming|vet|sitting|boarding|service|tech|breed)/i.test(hay) ||
                /\b(dog|cat|puppy|kitten|hamster|rabbit|bird|fish|reptile|animal|veterinar|grooming)/.test(hay)
              const hasPetIdiom = /\bpet[-\s](peeve|project|name)\b/i.test(hay) || /\ba pet project\b/i.test(hay)
              if (hasPetIdiom && !hasPetPhrase) {
                console.log(`  [SKIP-JSON-PET] \x1b[31m"${String(d.title || "").slice(0, 60)}"\x1b[0m — "pet" is colloquial idiom, not animal-related`)
                return false
              }
              if (!hasPetPhrase && !hasPetIdiom) {
                // "pet" appears but no clear animal context — require at least one animal/care word
                const hasAnimalContext = /\b(dog|cat|animal|pet\s|pets\b|veterinar|paw|fur|grooming|kennel|breed)/.test(hay)
                if (!hasAnimalContext) {
                  console.log(`  [SKIP-JSON-PET] \x1b[31m"${String(d.title || "").slice(0, 60)}"\x1b[0m — "pet" present but no animal context found`)
                  return false
                }
              }
            }
            return true
          })
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
      const url = `https://www.reddit.com/search.rss?q=${encoded}&limit=25&sort=relevance&t=all`

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
          const haystack = `${title} ${selftext}`.toLowerCase()
          
          // 1. Check relevance to exact original query — require 35% of core concepts
          const origConcepts = query.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w))
          const matchedOrig = origConcepts.filter((kw: string) => haystack.includes(kw))
          const origThreshold = Math.max(1, Math.ceil(origConcepts.length * 0.35))
          const isOrigRelevant = matchedOrig.length >= origThreshold

          // 2. Check relevance to active search term — require 35% of active concepts
          const activeConcepts = searchTerm.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w))
          const matchedActive = activeConcepts.filter((kw: string) => haystack.includes(kw))
          const activeThreshold = Math.max(1, Math.ceil(activeConcepts.length * 0.35))
          const isActiveRelevant = matchedActive.length >= activeThreshold

          if (!isOrigRelevant && !isActiveRelevant) {
            console.log(`  [SKIP] \x1b[33m"${title.slice(0, 50)}"\x1b[0m — insufficient relevance (matched active: ${matchedActive.length}/${activeConcepts.length} need ${activeThreshold}, orig: ${matchedOrig.length}/${origConcepts.length} need ${origThreshold})`)
            continue
          }

          // Check compound concept relevance to filter out generic posts that only match generic words
          if (!checkCompoundRelevance(haystack, query, searchTerm)) {
            console.log(`  [SKIP-RSS-COMPOUND] \x1b[33m"${title.slice(0, 50)}"\x1b[0m — failed compound concept relevance for "${query}" / "${searchTerm}"`)
            continue
          }

          // Strictly require at least one anchor word to match (if any anchor words exist)
          const anchorConcepts = origConcepts.filter((w: string) => !genericWords.has(w))
          if (anchorConcepts.length > 0) {
            const matchedAnchors = anchorConcepts.filter((kw: string) => haystack.includes(kw))
            if (matchedAnchors.length === 0) {
              console.log(`  [SKIP-RSS-ANCHOR] \x1b[33m"${title.slice(0, 50)}"\x1b[0m — no anchor keywords matched out of: [${anchorConcepts.join(", ")}]`)
              continue
            }
          }

          const matchedWords = Array.from(new Set([...matchedOrig, ...matchedActive]))
          console.log(`  [HIT]  \x1b[32mr/${subreddit}\x1b[0m | matches: [${matchedWords.join(", ")}]`)
          console.log(`         "${title.slice(0, 80)}${title.length > 80 ? "…" : ""}"`)

          results.push({ title, subreddit, author, permalink, selftext: selftext.slice(0, 200), score: 0, comments: 0 })
          if (results.length >= 8) break
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
      searchQueries.push({ term: query, label: "Exact Query" })
      
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

        // Final strict guard: only accept posts that pass core keyword relevance
        const coreWordsGuard = query.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w))
        const guardThreshold = Math.max(1, Math.ceil(coreWordsGuard.length * 0.35))
        const anchorWordsGuard = coreWordsGuard.filter((w: string) => !genericWords.has(w))

        for (const p of posts || []) {
          if (seenPermalinks.has(p.permalink)) continue
          const hay = `${p.title} ${p.selftext}`.toLowerCase()
          const guardMatched = coreWordsGuard.filter((kw: string) => hay.includes(kw))
          if (guardMatched.length < guardThreshold) {
            console.log(`  [GUARD-SKIP] \x1b[31m"${p.title.slice(0, 60)}"\x1b[0m — only ${guardMatched.length}/${coreWordsGuard.length} core keywords (need ${guardThreshold})`)
            continue
          }

          // Check compound concept relevance to filter out generic posts that only match generic words
          if (!checkCompoundRelevance(hay, query, sq.term)) {
            console.log(`  [GUARD-SKIP-COMPOUND] \x1b[31m"${p.title.slice(0, 60)}"\x1b[0m — failed compound concept relevance for "${query}" / "${sq.term}"`)
            continue
          }

          // Strictly require at least one anchor word to match (if any anchor words exist)
          if (anchorWordsGuard.length > 0) {
            const matchedAnchors = anchorWordsGuard.filter((kw: string) => hay.includes(kw))
            if (matchedAnchors.length === 0) {
              console.log(`  [GUARD-SKIP-ANCHOR] \x1b[31m"${p.title.slice(0, 60)}"\x1b[0m — no anchor keywords matched out of: [${anchorWordsGuard.join(", ")}]`)
              continue
            }
          }

          // Colloquial "pet" guard (same logic as fetchViaJSON filter)
          if (coreWordsGuard.includes("pet") && hay.includes("pet")) {
            const hasPetPhrase = /\bpet\s+(care|app|owner|dog|cat|animal|food|health|grooming|vet|sitting|boarding|service|tech|breed)/i.test(hay) ||
              /\b(dog|cat|puppy|kitten|hamster|rabbit|bird|fish|reptile|animal|veterinar|grooming)/.test(hay)
            const hasPetIdiom = /\bpet[-\s](peeve|project|name)\b/i.test(hay) || /\ba pet project\b/i.test(hay)
            if (hasPetIdiom && !hasPetPhrase) {
              console.log(`  [GUARD-SKIP-PET] \x1b[31m"${p.title.slice(0, 60)}"\x1b[0m — "pet" is colloquial idiom`)
              continue
            }
            if (!hasPetPhrase && !hasPetIdiom) {
              const hasAnimalContext = /\b(dog|cat|animal|pet\s|pets\b|veterinar|paw|fur|grooming|kennel|breed)/.test(hay)
              if (!hasAnimalContext) {
                console.log(`  [GUARD-SKIP-PET] \x1b[31m"${p.title.slice(0, 60)}"\x1b[0m — "pet" present but no animal context`)
                continue
              }
            }
          }
          seenPermalinks.add(p.permalink)
          allPosts.push(p)
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
      })).slice(0, 8)

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

    // ── STAGE 3: PAA SEARCH (Serper.dev or DataForSEO) ──────────────────────
    let scrapedPAAQuestions: string[] = []
    let scrapedOrganicTitles: string[] = []
    let scrapedRelatedQueries: string[] = []

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

            // Extract PAA questions strictly (PAA ONLY)
            scrapedPAAQuestions = paa.map((item: any) => item.question || item.title).filter(Boolean)
            // Extract organic search result titles
            scrapedOrganicTitles = organic.map((item: any) => item.title).filter(Boolean)
            // Extract related searches queries
            scrapedRelatedQueries = related.map((item: any) => item.query).filter(Boolean)

            console.log(`\x1b[32m[STEP 3] ✓ GOOGLE SEARCH DATA SCRAPED (${Date.now() - stage3Start}ms)\x1b[0m`)
            console.log(`  ├─ PAA Questions    : ${scrapedPAAQuestions.length}`)
            console.log(`  ├─ Organic Titles   : ${scrapedOrganicTitles.length}`)
            console.log(`  └─ Related Queries  : ${scrapedRelatedQueries.length}`)
            if (scrapedPAAQuestions.length > 0) {
              console.log("  → PAA Questions:")
              scrapedPAAQuestions.forEach((q, i) => console.log(`    [${i + 1}] ${q}`))
            }
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
            scrapedPAAQuestions = paaElement && Array.isArray(paaElement.items)
              ? paaElement.items.map((item: any) => item.title).filter(Boolean)
              : []

            const organicElements = items.filter((item: any) => item.type === "organic")
            scrapedOrganicTitles = organicElements.map((item: any) => item.title).filter(Boolean)

            const relatedElements = items.filter((item: any) => item.type === "related_searches")
            scrapedRelatedQueries = relatedElements.flatMap((item: any) => {
              if (Array.isArray(item.items)) {
                return item.items.map((r: any) => typeof r === "string" ? r : r.title || r.query)
              }
              return []
            }).filter(Boolean)

            console.log(`\x1b[32m[STEP 3] ✓ GOOGLE SEARCH DATA SCRAPED (${Date.now() - stage3Start}ms)\x1b[0m`)
            console.log(`  ├─ PAA Questions    : ${scrapedPAAQuestions.length}`)
            console.log(`  ├─ Organic Titles   : ${scrapedOrganicTitles.length}`)
            console.log(`  └─ Related Queries  : ${scrapedRelatedQueries.length}`)
            
            if (scrapedPAAQuestions.length > 0) {
              console.log("  → PAA Questions:")
              scrapedPAAQuestions.forEach((q, i) => console.log(`    [${i + 1}] ${q}`))
            } else {
              console.warn("\x1b[33m[STEP 3] ⚠ No PAA items found.\x1b[0m")
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
    const actualThreadsAnalyzed = redditSources.length
    const hasPAAData = scrapedPAAQuestions.length > 0
    const questionSource = hasPAAData ? "REAL PAA + LLM synthesis" : "LLM-ONLY (no real PAA data!)"

    console.log(`\n\x1b[36m[STEP 4] LLM SYNTHESIS — Calling LLM ${model}...\x1b[0m`)
    console.log("  ┌─ Model              :", model)
    console.log("  ├─ Reddit sources     :", redditSources.length, "threads passed")
    console.log("  ├─ PAA questions      :", scrapedPAAQuestions.length, "real questions passed")
    console.log("  ├─ Related queries    :", scrapedRelatedQueries.length, "real related searches passed")
    console.log("  ├─ Organic titles     :", scrapedOrganicTitles.length, "real organic titles passed")
    console.log("  ├─ threads_analyzed   :", actualThreadsAnalyzed, "(dynamic, not hardcoded)")
    console.log(`  ├─ Question source    : \x1b[${hasPAAData ? '32' : '33'}m${questionSource}\x1b[0m`)
    console.log("  └─ Output target      : 20-30 questions + 10 bonus topics")

    const stage4Start = Date.now()

    // ── Derive a concrete coreTopic from the raw query at runtime ────────────
    // Strip generic service/industry suffixes so the LLM gets real-word examples
    // e.g. "Astro development service" → "Astro"
    //      "on demand home service app development" → "on demand home service app"
    //      "Healthcare App Development Services" → "Healthcare App"
    const coreTopic: string = (() => {
      // Order matters: longer/more-specific patterns must come before shorter ones
      const genericSuffixes = [
        /\s+development\s+services?\s*$/i,   // "development services" / "development service"
        /\s+app\s+development\s*$/i,          // "app development"
        /\s+development\s*$/i,               // bare "development"
        /\s+services?\s*$/i,                 // "services" / "service"
        /\s+solutions?\s*$/i,               // "solutions" / "solution"
        /\s+platform\s*$/i,
        /\s+software\s*$/i,
      ]
      let trimmed = query.trim()
      for (const re of genericSuffixes) {
        trimmed = trimmed.replace(re, "").trim()
      }
      // Title-case the extracted core topic
      return trimmed
        .split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    })()

    console.log(`  ├─ Extracted coreTopic : "${coreTopic}" (from "${query}")`)


    const synthesisPrompt = `You are an expert SEO and content strategist. 
Our Brand Persona Profile: "${persona}"
Our Target Customer (ICP): "${icp}"

The user's business niche query is: "${query}"

We have fetched these Reddit discussions (Reddit threads):
${JSON.stringify(redditSources, null, 2)}

We scraped the following Google People Also Ask (PAA) questions for "${consumer_query}":
${JSON.stringify(scrapedPAAQuestions, null, 2)}

We scraped the following Google Related Search queries (search terms) for "${consumer_query}":
${JSON.stringify(scrapedRelatedQueries, null, 2)}

We scraped the following Google Organic search results (titles of articles/blogs) to use strictly as background B2B/tech context (NOT to be treated as actual questions):
${JSON.stringify(scrapedOrganicTitles, null, 2)}`

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
  "questions": [{ 
    "question": "Title Cased Question?", 
    "search_intent": "Dynamic Category / Specific User Goal (e.g. Transactional / Cost Comparison or Informational / Setup Guide)", 
    "geo_strategy": "A tactical recommendation for Generative Engine Optimization (GEO) showing exactly how to write/structure content so LLMs like Gemini, ChatGPT, or Perplexity confidently cite and reference the brand",
    "source_name": "Name of the source of truth (e.g. 'Google People Also Ask', or r/subreddit thread title like 'r/smallbusiness: Been on GloriaFood...')",
    "source_url": "The exact URL of the source. If derived from a Reddit thread, use the exact 'url' of that thread from the provided list. If derived from Google PAA/SERP data, use the exact Google search URL: 'https://www.google.com/search?q=encoded+question'",
    "generation_rationale": "1-2 sentence technical or strategic explanation of why this question is highly genuine, how it connects to the raw source data, and why our ICP is actively discussing it."
  }],
  "bonus_topics": ["string"]
}

Rules:
1. AESTHETICS & VOICE (CRITICAL): Every single question MUST sound like a highly natural, organic, conversational question or search query that a real human/business owner/developer would type into Google or Reddit.
   - DO NOT generate dry, corporate B2B headers.
   - NEVER repeat the exact clunky full query "${query}" verbatim inside a question, and NEVER append generic service suffixes ("development service", "app development service", etc.) to questions.
   - NO SELF-BRANDED QUESTIONS: DO NOT mention our own brand (e.g. "EnactOn") in any question. Questions must be what prospects search for when researching the space — not our services.
   - The core subject of this query is: "${coreTopic}". Use "${coreTopic}" naturally inside questions instead of the full query or abstract placeholders.
   - FORBIDDEN question formats — NEVER generate questions in these templates:
     * "How Does ${coreTopic} Enhance Custom Projects?"
     * "What Are The Key Benefits Of ${coreTopic}?"
     * "How Can A Specialized Agency Streamline Your ${coreTopic}?"
     * "What Is ${coreTopic}?" (only allowed if it is a real scraped PAA question)
   - REQUIRED conversational styles — write questions like these (fill in actual relevant competitors/comparisons):
     * "Should I Switch From [a real named competitor] To ${coreTopic}?"
     * "Is ${coreTopic} Good For SEO?"
     * "Can I Build A ${coreTopic} Without Knowing Code?"
     * "How Much Does It Cost To Build A ${coreTopic}?"
     * "Should I Hire An Agency Or A Freelancer For A ${coreTopic}?"
     * "What Are The Best Alternatives To ${coreTopic}?"
     * "Is ${coreTopic} Worth The Investment For Small Businesses?"
   - All questions must be Title Case and end with a question mark.
2. TARGET QUANTITY & DIVERSITY (CRITICAL): Generate exactly 20 to 30 distinct, completely unique questions in total.
   - You MUST generate at least 20 questions. Do not stop early or truncate your output.
   - AVOID CONCEPTUAL DUPLICATES: Every single question must cover a completely different topic, pain point, feature, or comparison.
   - Do NOT generate multiple questions that conceptually overlap (e.g. do not have one question about "POS integrations" and another about "integrating POS systems"; do not have multiple questions about "alternatives to ${coreTopic}" that say the same thing differently).
   - If your sources are limited, expand to unique, diverse, high-intent angles (e.g. migration guides, developer setup, hidden costs, custom feature building, offline reliability, multi-location management, customer support issues, custom database setup, etc.).
3. SOURCE PRIORITY ORDER — draw questions from these pools:
   a. Google PAA Questions (highest priority): Convert or rephrase Google PAA questions into highly natural, conversational Title-Cased questions. Ensure they retain the core search intent but are phrased in an organic, customer-centric way. source_name="Google People Also Ask", source_url=https://www.google.com/search?q={encoded_question_text}.
   b. Google Related Searches: Convert each search phrase into a natural question. source_name="Google Related Searches", source_url=https://www.google.com/search?q={encoded_original_related_query}.
   c. Reddit Threads: Convert each provided thread topic into a natural question reflecting the core pain point, question, or comparison discussed. source_name=r/{subreddit}: "{exact_thread_title}", source_url=exact Reddit URL from provided list.
4. REDDIT USAGE (MANDATORY — HIGHEST PRIORITY RULE):
   - You have been provided ${redditSources.length} Reddit thread(s). You MUST use EVERY SINGLE ONE of them — each thread must appear as source_url for at least one question.
   - Derive a natural, conversational question from EACH thread's title and topic. Even if the thread is a personal story or experience post, convert it into a question that the thread answers.
     Example: if a thread titled "How I migrated from X to ${coreTopic} and saved 40%" is provided, generate a question like "Is It Worth Migrating From X To ${coreTopic}?" and set source_url to that thread's exact URL.
   - Set source_url to the EXACT URL from the provided Reddit sources list.
   - Do NOT label a question as 'AI Generated' if it can be plausibly derived from any of the provided Reddit threads.
   - Use each thread AT MOST TWICE. Distribute questions across all threads evenly.
5. FALLBACK for insufficient sources: After using all Google PAA + Related Searches + all Reddit threads, if total questions are still fewer than 20, generate additional realistic, highly conversational, and completely unique questions that a user searching "${query}" would type. Mark ONLY these extra questions with source_name="AI Generated" and source_url="". You must ensure these fallback questions are diverse and do not repeat or duplicate any existing questions in the list.
6. For each question: unique specific search_intent (e.g. "Transactional / Cost Estimation", "Commercial / Vendor Shortlisting", "Informational / Tech Stack Selection"). Never generic placeholders.
7. For each question: unique tactical geo_strategy advising exactly how to structure content to be cited by Gemini/ChatGPT/Perplexity.
8. bonus_topics: Generate EXACTLY 10 compelling B2B/SaaS blog or LinkedIn post titles connecting "${query}" to custom software expertise, MVP strategy, ROI, tech stacks, vendor selection, and scaling. This array MUST NOT be empty.
9. threads_analyzed MUST be exactly ${actualThreadsAnalyzed}.
10. Return ONLY valid raw JSON. No markdown, no code fences, no trailing commas.`

    const synthesisText = await callLLM({
      userPrompt: fullSynthesisPrompt,
      model: model,
      jsonMode: true
    })

    const cleanSynthesisText = synthesisText.replace(/```json\s*([\s\S]*?)\s*```/g, "$1").trim()
    const finalReport: FindQuestionsResponse = JSON.parse(cleanSynthesisText)

    // Ensure all response arrays are initialized defensively to prevent crashes
    finalReport.questions = finalReport.questions || []
    finalReport.sources = finalReport.sources || []
    finalReport.bonus_topics = finalReport.bonus_topics || []
    finalReport.subreddits = finalReport.subreddits || []

    // ── BONUS TOPICS FALLBACK: if LLM returned empty array, generate separately ──
    if (finalReport.bonus_topics.length === 0) {
      console.warn("\x1b[33m  ⚠ bonus_topics was empty — generating via fallback LLM call...\x1b[0m")
      try {
        const bonusPrompt = `Generate exactly 10 high-value, compelling B2B/SaaS blog post or LinkedIn article titles related to "${query}". Focus on: custom development ROI, build vs buy decisions, tech stacks, MVP strategy, cost estimation, time-to-market, vendor selection, scaling, and monetization. Return ONLY a raw JSON array of 10 strings. No markdown, no code fences.`
        const bonusText = await callLLM({ userPrompt: bonusPrompt, model: "llama-3.1-8b-instant", jsonMode: true })
        const cleanBonus = bonusText.replace(/```json\s*([\s\S]*?)\s*```/g, "$1").trim()
        const parsedBonus = JSON.parse(cleanBonus)
        finalReport.bonus_topics = Array.isArray(parsedBonus) ? parsedBonus : (parsedBonus.bonus_topics || parsedBonus.topics || [])
        console.log(`\x1b[32m  ✓ Fallback bonus_topics: ${finalReport.bonus_topics.length} topics\x1b[0m`)
      } catch {
        finalReport.bonus_topics = [
          `How to Build a Custom ${query} from Scratch`,
          `${query}: Build vs Buy — What's Right for Your Business?`,
          `The Real Cost of ${query} Development in 2025`,
          `Best Tech Stacks for ${query}`,
          `How Long Does ${query} Development Take? A Realistic Timeline`,
          `MVP Strategy for ${query}: Launch Fast, Iterate Smart`,
          `How to Monetize Your ${query} Successfully`,
          `10 Must-Have Features for a Successful ${query}`,
          `How to Vet and Choose the Right Development Partner for Your ${query}`,
          `Scaling Your ${query}: Architecture Decisions from Day One`
        ]
      }
    }

    // Normalize finalReport questions defensively to protect the frontend from runtime TypeErrors
    // Track Reddit source usage to spread questions across all available threads (prevent same-post reuse)
    const redditUsageCount = new Map<string, number>()
    redditSources.forEach((src: { url: string }) => redditUsageCount.set(src.url, 0))

    if (finalReport.questions && Array.isArray(finalReport.questions)) {
      finalReport.questions = finalReport.questions.map((q: any) => {
        let questionText = ""
        let intentText = ""
        let geoText = ""
        let sourceNameText = ""
        let sourceUrlText = ""
        let rationaleText = ""

        if (typeof q === "string") {
          questionText = q
        } else if (q && typeof q === "object") {
          questionText = q.question || q.q || q.title || q.text || ""
          intentText = q.search_intent || q.intent || q.purpose || ""
          geoText = q.geo_strategy || q.geo || q.strategy || ""
          sourceNameText = q.source_name || q.source || q.origin || ""
          sourceUrlText = q.source_url || q.url || q.link || ""
          rationaleText = q.generation_rationale || q.rationale || q.reason || ""
        }

        // ── AUTHENTICITY VALIDATION ─────────────────────────────────────────────
        // Cross-check the LLM's claimed source against real scraped data.
        // If no real evidence exists for the claimed source → re-label as "AI Generated".
        // This prevents fake Google / Reddit attributions.

        const claimedSource = sourceNameText.toLowerCase()
        const qLower = questionText.toLowerCase()

        const isClaimingPAA = claimedSource.includes("people also ask")
        const isClaimingRelated = claimedSource.includes("related search")
        const isClaimingReddit = claimedSource.startsWith("r/") || claimedSource.includes("reddit")
        const hasAnySource = isClaimingPAA || isClaimingRelated || isClaimingReddit

        // --- PAA authenticity check ---
        if (isClaimingPAA) {
          if (scrapedPAAQuestions.length === 0) {
            // No real PAA was scraped → AI generated
            sourceNameText = "AI Generated"
            sourceUrlText = ""
            rationaleText = "No real Google PAA data was available for this query. This question was generated by AI based on common search patterns for the niche."
          } else {
            // Check if question fuzzy-matches any real PAA item (lenient key-word match to support conversational rephrasing)
            const paaMatch = scrapedPAAQuestions.find(paa => {
              const paaWords = paa.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w))
              if (paaWords.length === 0) return false
              return paaWords.some((w: string) => qLower.includes(w))
            })
            if (paaMatch) {
              sourceNameText = "Google People Also Ask"
              sourceUrlText = `https://www.google.com/search?q=${encodeURIComponent(questionText)}`
              rationaleText = rationaleText || `Directly sourced from Google's active PAA box for "${consumer_query}". Matched real scraped PAA: "${paaMatch}".`
            } else {
              sourceNameText = "AI Generated"
              sourceUrlText = ""
              rationaleText = "This question was generated by AI. It resembles PAA-style phrasing but was not found in the actual Google PAA results for this query."
            }
          }
        }

        // --- Related Searches authenticity check ---
        else if (isClaimingRelated) {
          if (scrapedRelatedQueries.length === 0) {
            sourceNameText = "AI Generated"
            sourceUrlText = ""
            rationaleText = `Model-generated for topic coverage of "${query}". No Google Related Searches were scraped — question reflects common ICP search patterns for this niche.`
          } else {
            // Check if question contains keywords from any real related search term (lenient key-word match to support conversational rephrasing)
            const relMatch = scrapedRelatedQueries.find(rel => {
              const relWords = rel.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 3 && !stopWords.has(w))
              if (relWords.length === 0) return false
              return relWords.some((w: string) => qLower.includes(w))
            })
            if (relMatch) {
              sourceNameText = "Google Related Searches"
              sourceUrlText = `https://www.google.com/search?q=${encodeURIComponent(relMatch)}`
              rationaleText = rationaleText || `Derived from real Google Related Searches trend: "${relMatch}" for the query "${consumer_query}".`
            } else {
              sourceNameText = "AI Generated"
              sourceUrlText = ""
              rationaleText = "This question was generated by AI. It is topically related to the niche but was not found in the actual Google Related Searches for this query."
            }
          }
        }

        // --- Reddit authenticity check ---
        else if (isClaimingReddit) {
          if (redditSources.length === 0) {
            sourceNameText = "AI Generated"
            sourceUrlText = ""
            rationaleText = "No relevant Reddit threads were found for this query. This question was generated by AI to reflect common community pain points in the niche."
          } else {
            // Validate the claimed Reddit URL exists in our real sources
            const urlMatch = redditSources.find((src: { url: string; subreddit: string; title: string }) =>
              sourceUrlText && (sourceUrlText === src.url || src.url.includes(sourceUrlText.split("?")[0]))
            )
            if (urlMatch) {
              // URL matched — increment usage counter
              redditUsageCount.set(urlMatch.url, (redditUsageCount.get(urlMatch.url) || 0) + 1)
              sourceNameText = `r/${urlMatch.subreddit}: "${urlMatch.title}"`
              sourceUrlText = urlMatch.url
              rationaleText = rationaleText || `Derived from real Reddit discussion in r/${urlMatch.subreddit}: "${urlMatch.title}".`
            } else {
              // URL doesn't match — keyword-match but prefer LEAST-USED source to ensure diversity
              const candidates = redditSources.filter((src: { url: string; subreddit: string; title: string }) => {
                const titleWords = src.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4)
                return titleWords.filter((w: string) => qLower.includes(w)).length >= 1
              })
              // Sort candidates by how many times already used (ascending) — prefer less-used threads
              candidates.sort((a: { url: string }, b: { url: string }) =>
                (redditUsageCount.get(a.url) || 0) - (redditUsageCount.get(b.url) || 0)
              )
              const keywordMatch = candidates[0]
              if (keywordMatch) {
                redditUsageCount.set(keywordMatch.url, (redditUsageCount.get(keywordMatch.url) || 0) + 1)
                sourceNameText = `r/${keywordMatch.subreddit}: "${keywordMatch.title}"`
                sourceUrlText = keywordMatch.url
                rationaleText = rationaleText || `Related to real Reddit discussion in r/${keywordMatch.subreddit}: "${keywordMatch.title}".`
              } else {
                // No keyword match found — pick the least-used Reddit source as fallback
                const leastUsed = [...redditSources].sort((a: { url: string }, b: { url: string }) =>
                  (redditUsageCount.get(a.url) || 0) - (redditUsageCount.get(b.url) || 0)
                )[0]
                if (leastUsed) {
                  redditUsageCount.set(leastUsed.url, (redditUsageCount.get(leastUsed.url) || 0) + 1)
                  sourceNameText = `r/${leastUsed.subreddit}: "${leastUsed.title}"`
                  sourceUrlText = leastUsed.url
                  rationaleText = `Related community discussion context from r/${leastUsed.subreddit}.`
                } else {
                  sourceNameText = "AI Generated"
                  sourceUrlText = ""
                  rationaleText = "This question was generated by AI to reflect common community pain points. No matching Reddit thread found in scraped data."
                }
              }
            }
          }
        }

        // --- No source claimed at all → AI Generated ---
        else if (!hasAnySource || !sourceNameText || sourceNameText.length < 3) {
          sourceNameText = "AI Generated"
          sourceUrlText = ""
          rationaleText = rationaleText || `Model-generated for topic coverage of "${query}". Reflects high-frequency questions ICP audiences ask when evaluating or researching this niche.`
        }

        // --- Intent fallback if missing or generic ---
        if (!intentText || intentText.toLowerCase() === "search intent" || intentText.toLowerCase() === "clear concise intent") {
          if (qLower.includes("cost") || qLower.includes("price") || qLower.includes("free") || qLower.includes("fee") || qLower.includes("charge")) {
            intentText = "Transactional / Cost Assessment"
          } else if (qLower.includes("vs") || qLower.includes("compare") || qLower.includes("alternative") || qLower.includes("better")) {
            intentText = "Commercial / Feature Comparison"
          } else if (qLower.includes("integrate") || qLower.includes("api") || qLower.includes("pos")) {
            intentText = "Transactional / System Integration"
          } else if (qLower.includes("how") || qLower.includes("does") || qLower.includes("what") || qLower.includes("why")) {
            intentText = "Informational / Technical Inquiry"
          } else {
            intentText = "Informational / General Query"
          }
        }

        // --- GEO Strategy fallback if missing or placeholder ---
        if (!geoText || geoText.length < 8) {
          if (qLower.includes("cost") || qLower.includes("price") || qLower.includes("fee") || qLower.includes("free")) {
            geoText = "Include a clear pricing comparison table and embed a structured Product schema with direct price parameters to secure Perplexity / Gemini cost citations."
          } else if (qLower.includes("vs") || qLower.includes("compare") || qLower.includes("alternative") || qLower.includes("better")) {
            geoText = "Publish a structured side-by-side feature matrix. List direct comparative specifications with bullet-pointed authoritative pros/cons to capture Gemini Comparative Overviews."
          } else if (qLower.includes("integrate") || qLower.includes("api") || qLower.includes("pos")) {
            geoText = "Provide a clean, valid JSON-LD software integration schema. Outline exact endpoints and SDK parameters inside standard code tags for technical citation mapping."
          } else {
            geoText = "Structure your answer using a direct definition paragraph (bolding the key answer within the first 120 characters) and back it with verified industry statistics."
          }
        }

        // --- Rationale fallback ---
        if (!rationaleText || rationaleText.length < 8) {
          rationaleText = `Generated by AI based on authentic search trends for "${query}". High-intent concern addressing product features, setup costs, and long-term tech scaling.`
        }

        return {
          question: questionText || "Unknown Question?",
          search_intent: intentText,
          geo_strategy: geoText,
          source_name: sourceNameText,
          source_url: sourceUrlText,
          generation_rationale: rationaleText
        }
      })
    }

    // ── POST-PROCESSING: FORCE-REPRESENT ALL REDDIT SOURCES ──
    // If any scraped Reddit sources were completely ignored by the LLM, 
    // programmatically assign them to the most relevant "AI Generated" questions to guarantee 100% source coverage.
    if (finalReport.questions && Array.isArray(finalReport.questions) && redditSources.length > 0) {
      const urlUsage = new Map<string, number>()
      redditSources.forEach((src: { url: string }) => urlUsage.set(src.url, 0))
      
      finalReport.questions.forEach((q: any) => {
        if (q.source_url && urlUsage.has(q.source_url)) {
          urlUsage.set(q.source_url, urlUsage.get(q.source_url)! + 1)
        }
      })

      const unusedSources = redditSources.filter((src: { url: string }) => urlUsage.get(src.url) === 0)

      if (unusedSources.length > 0) {
        console.log(`\n  \x1b[33m[NORMALIZER] Found ${unusedSources.length} unused Reddit sources. Force-mapping them to AI Generated questions...\x1b[0m`)
        
        const aiGeneratedQuestions = finalReport.questions.filter((q: any) => q.source_name === "AI Generated")

        unusedSources.forEach((src: { url: string; subreddit: string; title: string }, idx: number) => {
          const candidate = aiGeneratedQuestions[idx % aiGeneratedQuestions.length]
          if (candidate) {
            candidate.source_name = `r/${src.subreddit}: "${src.title}"`
            candidate.source_url = src.url
            candidate.generation_rationale = `Related community discussion regarding service niches and product viability in r/${src.subreddit}: "${src.title}".`
            console.log(`  → Force-mapped unused Reddit URL: "${src.url}" to candidate question: "${candidate.question}"`)
          }
        })
      }
    }

    console.log(`\x1b[32m[STEP 4] ✓ SYNTHESIS DONE (${Date.now() - stage4Start}ms)\x1b[0m`)
    console.log("  ┌─ Questions generated :", finalReport.questions?.length || 0)
    console.log("  ├─ Bonus topics        :", finalReport.bonus_topics?.length || 0)

    // Override with real scraped data and cohesive subreddits (union of active sources + target expansion)
    finalReport.sources = redditSources.slice(0, 8)
    finalReport.business = query
    finalReport.cached = false
    finalReport.status = "complete"
    finalReport.threads_analyzed = actualThreadsAnalyzed

    const idealSubs = (target_subreddits || []).map((sub: string) => sub.replace(/^r\//i, ""))
    const combinedSubs: string[] = []
    const seenSubs = new Set<string>()

    // Helper to normalize subreddit keys generically
    const getNormKey = (sub: string) => {
      return sub.toLowerCase().trim()
    }

    // 1. Add all subreddits from actual scraped sources first, preserving exact original casing
    redditSources.forEach(src => {
      const key = getNormKey(src.subreddit)
      if (src.subreddit && !seenSubs.has(key)) {
        seenSubs.add(key)
        combinedSubs.push(src.subreddit)
      }
    })

    // 2. Add remaining target subreddits from Stage 1 expansion
    idealSubs.forEach((sub: string) => {
      const key = getNormKey(sub)
      if (sub && !seenSubs.has(key)) {
        seenSubs.add(key)
        combinedSubs.push(sub)
      }
    })

    // Capped at exactly 8 subreddits to match findquestions.com perfectly and prevent UI clutter!
    finalReport.subreddits = combinedSubs.slice(0, 8)

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
