// Reddit Scraping Service
// Multi-provider scraping with automatic fallback: Reddit JSON API → Apify → Firecrawl → Tavily

import { ScrapedPost, ScrapingProvider } from "./types"
import { supabase } from "@/lib/supabase/client"

const REDDIT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Gets API keys from env vars first, falls back to database settings.
 */
async function getServiceKeys(): Promise<{ apify?: string; firecrawl?: string; tavily?: string }> {
  const keys: { apify?: string; firecrawl?: string; tavily?: string } = {}

  keys.apify = process.env.APIFY_API_TOKEN || undefined
  keys.firecrawl = process.env.FIRECRAWL_API_KEY || undefined
  keys.tavily = process.env.TAVILY_API_KEY || undefined

  // If any key is missing, try loading from database
  if (!keys.apify || !keys.firecrawl || !keys.tavily) {
    try {
      const { data } = await supabase.from("settings").select("reddit_services_config").eq("id", 1).single()
      const config = data?.reddit_services_config || {}
      if (!keys.apify && config.apify_key) keys.apify = config.apify_key
      if (!keys.firecrawl && config.firecrawl_key) keys.firecrawl = config.firecrawl_key
      if (!keys.tavily && config.tavily_key) keys.tavily = config.tavily_key
    } catch {
      // silently fail — env vars are the primary source
    }
  }

  return keys
}

/**
 * Deduplicates scraped posts by reddit_id, keeping the first occurrence.
 */
export function deduplicatePosts(posts: ScrapedPost[]): ScrapedPost[] {
  const seen = new Set<string>()
  return posts.filter((post) => {
    if (seen.has(post.reddit_id)) return false
    seen.add(post.reddit_id)
    return true
  })
}

/**
 * Truncates selftext to 2000 characters max.
 */
export function truncateSelftext(text: string | null | undefined): string {
  if (!text) return ""
  return text.length > 2000 ? text.slice(0, 2000) : text
}

/**
 * Extracts a normalized ScrapedPost from raw Reddit JSON API post data.
 */
export function extractPostFromRedditJson(data: Record<string, unknown>): ScrapedPost {
  const d = (data.data || data) as Record<string, unknown>
  return {
    reddit_id: String(d.id || d.name || ""),
    title: String(d.title || ""),
    author: String(d.author || "[deleted]"),
    subreddit: String(d.subreddit || ""),
    score: Number(d.score || 0),
    comment_count: Number(d.num_comments || 0),
    permalink: String(d.permalink || ""),
    selftext: truncateSelftext(d.selftext as string),
    upvote_ratio: Number(d.upvote_ratio || 0),
    created_utc: Number(d.created_utc || 0),
  }
}

// ============================================================
// Reddit JSON API Provider
// ============================================================

async function scrapeViaRedditApi(opts: {
  subreddit?: string
  keywords: string
  maxResults: number
  sort: string
  timeFilter: string
}): Promise<ScrapedPost[]> {
  const { subreddit, keywords, maxResults, sort, timeFilter } = opts
  const headers = {
    "User-Agent": REDDIT_USER_AGENT,
    Accept: "application/json",
  }

  let url: string
  if (subreddit && keywords && keywords.trim()) {
    // Always use search endpoint when keywords are provided — it actually finds matching posts
    // Note: Reddit search sort=hot is unreliable for small subreddits, use sort=new for better coverage
    const encoded = encodeURIComponent(keywords)
    const sortParam = sort === "rising" ? "new" : (sort === "hot" ? "new" : sort)
    url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encoded}&restrict_sr=on&limit=${maxResults}&sort=${sortParam}&t=${timeFilter}`
  } else if (subreddit) {
    // No keywords: use the feed endpoint directly
    if (sort === "top") {
      url = `https://www.reddit.com/r/${subreddit}/top.json?limit=${maxResults}&t=${timeFilter}`
    } else if (sort === "new") {
      url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${maxResults}`
    } else if (sort === "rising") {
      url = `https://www.reddit.com/r/${subreddit}/rising.json?limit=${maxResults}`
    } else {
      url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${maxResults}`
    }
  } else {
    const encoded = encodeURIComponent(keywords)
    const sortParam = sort === "relevance" ? "relevance" : sort
    url = `https://www.reddit.com/search.json?q=${encoded}&limit=${maxResults}&sort=${sortParam}&t=${timeFilter}`
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })

  if (res.status === 403 || res.status === 429) {
    throw new Error(`Reddit API blocked: ${res.status}`)
  }

  if (!res.ok) {
    throw new Error(`Reddit API error: ${res.status}`)
  }

  const json = await res.json()
  const children = json?.data?.children || []

  if (children.length === 0) {
    return []
  }

  return children
    .filter((c: Record<string, unknown>) => c.kind === "t3")
    .map((c: Record<string, unknown>) => extractPostFromRedditJson(c as Record<string, unknown>))
    .slice(0, maxResults)
}

// ============================================================
// Apify Provider
// ============================================================

async function scrapeViaApify(opts: {
  subreddit?: string
  keywords: string
  maxResults: number
  sort: string
  timeFilter: string
}): Promise<ScrapedPost[]> {
  const keys = await getServiceKeys()
  const token = keys.apify
  if (!token) throw new Error("APIFY_API_TOKEN not configured")

  const { subreddit, keywords, maxResults, sort, timeFilter } = opts

  let runInput: Record<string, unknown>

  if (subreddit) {
    const sectionUrl = `https://www.reddit.com/r/${subreddit}/${sort}/`
    runInput = {
      startUrls: [{ url: sectionUrl }],
      maxPostCount: maxResults,
      proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      skipComments: true,
      scrollTimeout: 12,
    }
  } else {
    runInput = {
      searches: [keywords],
      maxItems: maxResults,
      maxPostCount: maxResults,
      type: "post",
      sort,
      time: timeFilter,
      proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    // Start the actor run
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/trudax~reddit-scraper-lite/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runInput),
        signal: controller.signal,
      }
    )

    if (!startRes.ok) throw new Error(`Apify start failed: ${startRes.status}`)
    const runData = await startRes.json()
    const runId = runData?.data?.id

    if (!runId) throw new Error("Apify run ID not returned")

    // Poll for completion
    let status = "RUNNING"
    let datasetId = ""
    while (status === "RUNNING" || status === "READY") {
      await new Promise((r) => setTimeout(r, 2000))
      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
        { signal: controller.signal }
      )
      const statusData = await statusRes.json()
      status = statusData?.data?.status || "FAILED"
      datasetId = statusData?.data?.defaultDatasetId || ""
    }

    if (status !== "SUCCEEDED" || !datasetId) {
      throw new Error(`Apify run failed with status: ${status}`)
    }

    // Fetch results
    const dataRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${maxResults}`,
      { signal: controller.signal }
    )
    const items = await dataRes.json()

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Apify returned 0 results")
    }

    return items.map((item: Record<string, unknown>) => ({
      reddit_id: String(item.id || item.postId || ""),
      title: String(item.title || ""),
      author: String(item.author || item.username || "[deleted]"),
      subreddit: String(item.subreddit || item.communityName || ""),
      score: Number(item.score || item.upVotes || 0),
      comment_count: Number(item.numComments || item.numberOfComments || 0),
      permalink: String(item.url || item.permalink || ""),
      selftext: truncateSelftext(item.body as string || item.text as string),
      upvote_ratio: Number(item.upvoteRatio || 0),
      created_utc: Number(item.createdAt ? new Date(item.createdAt as string).getTime() / 1000 : 0),
    }))
  } finally {
    clearTimeout(timeout)
  }
}

// ============================================================
// Firecrawl Provider
// ============================================================

async function scrapeViaFirecrawl(opts: {
  subreddit?: string
  keywords: string
  maxResults: number
}): Promise<ScrapedPost[]> {
  const keys = await getServiceKeys()
  const apiKey = keys.firecrawl
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured")

  const { subreddit, keywords, maxResults } = opts
  const query = subreddit
    ? `site:reddit.com/r/${subreddit} ${keywords}`
    : `site:reddit.com ${keywords}`

  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: maxResults,
      scrapeOptions: { formats: ["markdown"] },
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) throw new Error(`Firecrawl error: ${res.status}`)

  const data = await res.json()
  const results = data?.data || []

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Firecrawl returned 0 results")
  }

  return results.map((item: Record<string, unknown>, i: number) => ({
    reddit_id: `firecrawl_${i}_${Date.now()}`,
    title: String(item.title || (item.metadata as Record<string, unknown>)?.title || ""),
    author: "[firecrawl]",
    subreddit: subreddit || extractSubredditFromUrl(String(item.url || "")),
    score: 0,
    comment_count: 0,
    permalink: String(item.url || ""),
    selftext: truncateSelftext(item.markdown as string || item.content as string),
    upvote_ratio: 0,
    created_utc: 0,
  }))
}

// ============================================================
// Tavily Provider
// ============================================================

async function scrapeViaTavily(opts: {
  subreddit?: string
  keywords: string
  maxResults: number
}): Promise<ScrapedPost[]> {
  const keys = await getServiceKeys()
  const apiKey = keys.tavily
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured")

  const { subreddit, keywords, maxResults } = opts
  const query = subreddit
    ? `r/${subreddit} ${keywords}`
    : `reddit ${keywords}`

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_domains: ["reddit.com"],
      search_depth: "advanced",
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)

  const data = await res.json()
  const results = data?.results || []

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Tavily returned 0 results")
  }

  return results.map((item: Record<string, unknown>, i: number) => ({
    reddit_id: `tavily_${i}_${Date.now()}`,
    title: String(item.title || ""),
    author: "[tavily]",
    subreddit: subreddit || extractSubredditFromUrl(String(item.url || "")),
    score: Number(item.score || 0),
    comment_count: 0,
    permalink: String(item.url || ""),
    selftext: truncateSelftext(item.content as string || item.raw_content as string),
    upvote_ratio: 0,
    created_utc: 0,
  }))
}

// ============================================================
// Helper: Extract subreddit name from URL
// ============================================================

function extractSubredditFromUrl(url: string): string {
  const match = url.match(/reddit\.com\/r\/(\w+)/)
  return match ? match[1] : ""
}

// ============================================================
// Main Scraping Function (with fallback chain)
// ============================================================

export async function scrapeReddit(opts: {
  subreddit?: string
  keywords: string
  maxResults: number
  sort: string
  timeFilter: string
  provider: ScrapingProvider
}): Promise<ScrapedPost[]> {
  const { provider, ...scrapeOpts } = opts

  // If a specific provider is requested, try it directly
  if (provider !== "reddit_api") {
    switch (provider) {
      case "apify":
        return deduplicatePosts(await scrapeViaApify(scrapeOpts))
      case "firecrawl":
        return deduplicatePosts(await scrapeViaFirecrawl(scrapeOpts))
      case "tavily":
        return deduplicatePosts(await scrapeViaTavily(scrapeOpts))
    }
  }

  // Default: Reddit API with fallback chain
  try {
    const posts = await scrapeViaRedditApi(scrapeOpts)
    return deduplicatePosts(posts)
  } catch (e) {
    console.warn(`Reddit API failed: ${e instanceof Error ? e.message : e}. Trying fallbacks...`)
  }

  // Load keys from env + database for fallback chain
  const keys = await getServiceKeys()

  // Fallback 1: Apify
  if (keys.apify) {
    try {
      const posts = await scrapeViaApify(scrapeOpts)
      return deduplicatePosts(posts)
    } catch (e) {
      console.warn(`Apify failed: ${e instanceof Error ? e.message : e}. Trying Firecrawl...`)
    }
  }

  // Fallback 2: Firecrawl
  if (keys.firecrawl) {
    try {
      const posts = await scrapeViaFirecrawl(scrapeOpts)
      return deduplicatePosts(posts)
    } catch (e) {
      console.warn(`Firecrawl failed: ${e instanceof Error ? e.message : e}. Trying Tavily...`)
    }
  }

  // Fallback 3: Tavily
  if (keys.tavily) {
    try {
      const posts = await scrapeViaTavily(scrapeOpts)
      return deduplicatePosts(posts)
    } catch (e) {
      console.warn(`Tavily failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  throw new Error("All scraping providers failed. Check your API keys and try again.")
}

// ============================================================
// Fetch Subreddit Rules
// ============================================================

export async function fetchSubredditRules(subredditName: string): Promise<string | null> {
  const headers = {
    "User-Agent": REDDIT_USER_AGENT,
    Accept: "application/json",
  }

  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subredditName}/about/rules.json`,
      { headers, signal: AbortSignal.timeout(10000) }
    )

    if (!res.ok) return null

    const data = await res.json()
    const rules = data?.rules || []

    if (rules.length === 0) return null

    return rules
      .map(
        (r: { short_name?: string; description?: string }) =>
          `${r.short_name || "Rule"}: ${r.description || ""}`
      )
      .join("\n")
  } catch {
    // If Reddit API fails, try Apify as fallback
    if (process.env.APIFY_API_TOKEN) {
      try {
        const token = process.env.APIFY_API_TOKEN
        const startRes = await fetch(
          `https://api.apify.com/v2/acts/apify~rag-web-browser/runs?token=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `https://www.reddit.com/r/${subredditName}/about/rules`,
              maxResults: 1,
              outputFormats: ["markdown"],
            }),
            signal: AbortSignal.timeout(45000),
          }
        )

        if (!startRes.ok) return null

        const runData = await startRes.json()
        const runId = runData?.data?.id
        if (!runId) return null

        // Poll for completion
        let status = "RUNNING"
        let datasetId = ""
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 2000))
          const statusRes = await fetch(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`
          )
          const statusData = await statusRes.json()
          status = statusData?.data?.status || "FAILED"
          datasetId = statusData?.data?.defaultDatasetId || ""
          if (status !== "RUNNING" && status !== "READY") break
        }

        if (status !== "SUCCEEDED" || !datasetId) return null

        const dataRes = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=1`
        )
        const items = await dataRes.json()
        if (Array.isArray(items) && items.length > 0) {
          return items[0].markdown || items[0].text || null
        }
      } catch {
        return null
      }
    }

    return null
  }
}
