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
          
          // 1. Check relevance to exact original query
          const origConcepts = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w))
          const matchedOrig = origConcepts.filter(kw => haystack.includes(kw))
          const origThreshold = Math.min(2, origConcepts.length)
          const isOrigRelevant = matchedOrig.length >= origThreshold

          // 2. Check relevance to active search term (e.g. related query)
          const activeConcepts = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w))
          const matchedActive = activeConcepts.filter(kw => haystack.includes(kw))
          const activeThreshold = Math.min(2, activeConcepts.length)
          const isActiveRelevant = matchedActive.length >= activeThreshold

          if (!isOrigRelevant && !isActiveRelevant) {
            console.log(`  [SKIP] \x1b[33m"${title.slice(0, 50)}"\x1b[0m — insufficient relevance (matched active: ${matchedActive.length}/${activeConcepts.length}, orig: ${matchedOrig.length}/${origConcepts.length})`)
            continue
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
    const actualThreadsAnalyzed = redditSources.length
    const hasPAAData = scrapedPAAQuestions.length > 0
    const questionSource = hasPAAData ? "REAL PAA + LLM synthesis" : "LLM-ONLY (no real PAA data!)"

    console.log(`\n\x1b[36m[STEP 4] LLM SYNTHESIS — Calling LLM ${model}...\x1b[0m`)
    console.log("  ┌─ Model              :", model)
    console.log("  ├─ Reddit sources     :", redditSources.length, "threads passed")
    console.log("  ├─ PAA questions      :", scrapedPAAQuestions.length, "real questions passed")
    console.log("  ├─ threads_analyzed   :", actualThreadsAnalyzed, "(dynamic, not hardcoded)")
    console.log(`  ├─ Question source    : \x1b[${hasPAAData ? '32' : '33'}m${questionSource}\x1b[0m`)
    console.log("  └─ Output target      : 20-30 questions + 10 bonus topics")

    if (!hasPAAData) {
      console.warn(`\x1b[33m  ⚠ WARNING: ${providerToUse === "serper" ? "Serper.dev" : "DataForSEO"} returned 0 PAA questions.\x1b[0m`)
      console.warn("  ⚠ ALL questions below will be LLM-fabricated, NOT from real Google search data.")
      console.warn(`  ⚠ To fix: verify your ${providerToUse === "serper" ? "Serper.dev API key" : "DataForSEO account at https://app.dataforseo.com/"}`)
    }

    const stage4Start = Date.now()

    const synthesisPrompt = `You are an expert SEO and content strategist. 
Our Brand Persona Profile: "${persona}"
Our Target Customer (ICP): "${icp}"

The user's business niche query is: "${query}"
We have fetched these Reddit discussions:
${JSON.stringify(redditSources, null, 2)}

We scraped the following real questions, organic search result titles, and Google related searches searchers ask about "${consumer_query}":
${JSON.stringify(scrapedPAAQuestions, null, 2)}`

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
  "questions": [{ "question": "Title Cased Question?", "search_intent": "Dynamic Category / Specific User Goal (e.g. Transactional / Cost Comparison or Informational / Setup Guide)", "geo_strategy": "A tactical recommendation for Generative Engine Optimization (GEO) showing exactly how to write/structure content so LLMs like Gemini, ChatGPT, or Perplexity confidently cite and reference the brand" }],
  "bonus_topics": ["string"]
}

Rules:
1. All questions must be Title Case and end with a question mark.
2. Generate exactly 20-30 questions. These MUST represent realistic, high-quality organic search queries that real people (specifically developers, tech founders, and product managers matching our ICP) type into Google regarding "${query}".
   - They MUST remain strictly relevant to the core topic ("${query}") and the discussions in the Reddit threads.
   - **STRICTLY NO REPETITION / REDUNDANCY:** All questions must be highly distinct. Do NOT include multiple questions that ask the same thing in different words or can be fully answered together in a single section of one blog post. (For example, do NOT include separate questions like "Is Astro faster than Next.js?", "Which is faster: Astro or Next.js?", and "Astro vs Next.js performance comparison"—merge those into one high-intent question, and use the other slots for unique developer/business concerns).
   - Do NOT forcefully inject unrelated brand keywords or specific services (such as "restaurant management system", "LMS", "mobile app", "AI solutions") unless the query or Reddit sources are directly about them.
   - Instead, capture authentic professional concerns: performance benchmarks, bundle sizes, CMS integrations, migration paths, hosting/infrastructure costs (Cloudflare, Vercel), learning curve, SEO rankings, and B2B scalability.
   - ${hasPAAData ? 'Base your expansion on the real scraped Google PAA questions provided, enriching them with specific, deep technical and business angles discussed in the Reddit threads.' : 'Generate highly realistic search-optimized B2B questions that users would search for regarding this topic.'}
3. For each generated question, you MUST provide a unique, highly specific, and accurate search intent in the "search_intent" field. Do NOT hardcode "Search Intent" or use placeholders! Capture the user's primary motivation (e.g. "Transactional / Checking free features", "Commercial / Toast comparison", "Informational / Table side QR setup", "Informational / Onboarding time", "Transactional / API POS feasibility", etc.).
4. For each generated question, you MUST provide a unique, highly specific, and tactical "geo_strategy" recommendation. Generative Engine Optimization (GEO) is about ensuring custom SaaS brands capture LLM citations. The strategy must advise exactly how to write/structure the section (e.g. 'Use a structured comparative table matching Direct Costs', 'Embed a valid JSON-LD product schema', 'Incorporate high-contrast definition boxes with exact technical specs like "PCI-DSS Level 1 compliance"', etc.) so Gemini, ChatGPT, or Perplexity pulls it as a primary source.
5. Exactly 10 bonus_topics. These should be high-value blog and social content topics that connect the query ("${query}") directly to custom software expertise, SaaS building, or MVP launch strategies suited for our Brand Persona.
6. threads_analyzed MUST be exactly ${actualThreadsAnalyzed}.
7. Return ONLY raw JSON. No markdown, no code fences.`

    const synthesisText = await callLLM({
      userPrompt: fullSynthesisPrompt,
      model: model,
      jsonMode: true
    })

    const cleanSynthesisText = synthesisText.replace(/```json\s*([\s\S]*?)\s*```/g, "$1").trim()
    const finalReport: FindQuestionsResponse = JSON.parse(cleanSynthesisText)

    // Normalize finalReport questions defensively to protect the frontend from runtime TypeErrors
    if (finalReport.questions && Array.isArray(finalReport.questions)) {
      finalReport.questions = finalReport.questions.map((q: any) => {
        let questionText = ""
        let intentText = ""
        let geoText = ""

        if (typeof q === "string") {
          questionText = q
        } else if (q && typeof q === "object") {
          questionText = q.question || q.q || q.title || q.text || ""
          intentText = q.search_intent || q.intent || q.purpose || ""
          geoText = q.geo_strategy || q.geo || q.strategy || ""
        }

        // Defensive Fallback Generator if the LLM output is missing or uses generic values
        if (!intentText || intentText.toLowerCase() === "search intent" || intentText.toLowerCase() === "clear concise intent") {
          const qLower = questionText.toLowerCase()
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

        // Defensive Fallback Generator for GEO Strategy if missing or placeholders are used
        if (!geoText || geoText.toLowerCase().includes("strategy") || geoText.length < 8) {
          const qLower = questionText.toLowerCase()
          if (qLower.includes("cost") || qLower.includes("price") || qLower.includes("fee") || qLower.includes("free")) {
            geoText = "Include a clear pricing comparison table and embed a structured Product schema with direct price parameters to secure Perplexity / Gemini cost citations."
          } else if (qLower.includes("vs") || qLower.includes("compare") || qLower.includes("alternative") || qLower.includes("better")) {
            geoText = "Publish a structured side-by-side feature matrix. List direct comparative specifications with bullet-pointed authoritative pros/cons to capture Gemini Comparative Overviews."
          } else if (qLower.includes("integrate") || qLower.includes("api") || qLower.includes("pos")) {
            geoText = "Provide a clean, valid JSON-LD software integration schema. Outline exact endpoints and SDK parameters inside standard standard code tags for technical citation mapping."
          } else {
            geoText = "Structure your answer using a direct definition paragraph (bolding the key answer within the first 120 characters) and back it with verified industry statistics."
          }
        }

        return {
          question: questionText || "Unknown Question?",
          search_intent: intentText,
          geo_strategy: geoText
        }
      })
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
    idealSubs.forEach(sub => {
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
