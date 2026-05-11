import { NextRequest, NextResponse } from "next/server"
import { Trend } from "@/lib/types"
import { fetchRedditPosts, RedditPost } from "@/lib/reddit"
import { supabase } from "@/lib/supabase/client"
import { getSettings } from "@/lib/settings"
import { fetchWebSearchTrends, analyzeRedditTrends, resolveProvider, AIProvider } from "@/lib/ai"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { stripHtml } from "@/lib/html"

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}

async function saveTrends(trends: Trend[]) {
  const found_at = new Date().toISOString()
  const seenTitles = new Set<string>()

  // Within-batch dedup
  const batchDeduped = trends.filter((t) => {
    const normalized = normalizeTitle(t.title)
    if (seenTitles.has(normalized)) return false
    seenTitles.add(normalized)
    return true
  })

  // For Reddit: skip titles already in DB (same posts stay "hot" for days)
  const redditTitles = batchDeduped.filter(t => t.source === "Reddit").map(t => t.title)
  const existingRedditTitles = new Set<string>()
  if (redditTitles.length > 0) {
    const { data } = await supabase.from("trends").select("title").eq("source", "Reddit").in("title", redditTitles)
    for (const r of data ?? []) existingRedditTitles.add(r.title)
  }

  const deduplicated = batchDeduped.filter(t =>
    t.source !== "Reddit" || !existingRedditTitles.has(t.title)
  )

  if (deduplicated.length === 0) return

  const rows = deduplicated.map((t) => ({
    title: t.title,
    summary: t.summary,
    source: t.source,
    relevance_score: t.relevanceScore,
    velocity: t.velocity,
    upvotes: t.upvotes ?? null,
    comments: t.comments ?? null,
    source_url: t.source_url ?? null,
    found_at,
  }))
  const { error } = await supabase.from("trends").insert(rows)
  if (error) throw new Error(`Supabase insert failed: ${error.message}`)
}

async function loadSavedTrends(): Promise<Trend[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("trends")
    .select("*")
    .gte("found_at", since)
    .order("found_at", { ascending: false })
    .limit(100)

  if (error || !data) return []

  return data.map((row: any) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    source: row.source,
    relevanceScore: row.relevance_score,
    velocity: row.velocity,
    upvotes: row.upvotes ?? undefined,
    comments: row.comments ?? undefined,
    source_url: row.source_url ?? undefined,
    found_at: row.found_at ?? undefined,
  }))
}

async function hasFreshTrends(): Promise<boolean> {
  const since = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from("trends")
    .select("id", { count: "exact", head: true })
    .gte("found_at", since)
  return (count ?? 0) > 0
}

function hashContent(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

async function scrapeSourceContent(urls: string[]): Promise<string> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

  const { data: cached } = await supabase
    .from("source_cache")
    .select("url, content, content_hash, scraped_at")
    .in("url", urls)

  const cacheMap = new Map((cached ?? []).map((r: any) => [r.url, r]))

  const staleUrls = urls.filter((url) => {
    const entry = cacheMap.get(url)
    return !entry || entry.scraped_at < sixHoursAgo
  })

  if (staleUrls.length > 0) {
    const scraped = await Promise.allSettled(
      staleUrls.map(async (url) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 3000)
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "harvey-content-fabric/1.0.0" },
            signal: controller.signal,
          })
          const html = await res.text()
          const text = stripHtml(html, 1000)
          return { url, text }
        } finally {
          clearTimeout(timer)
        }
      })
    )

    const upserts: { url: string; content: string; content_hash: string; scraped_at: string }[] = []
    for (const result of scraped) {
      if (result.status === "fulfilled") {
        const { url, text } = result.value
        const hash = hashContent(text)
        cacheMap.set(url, { url, content: text, content_hash: hash, scraped_at: new Date().toISOString() })
        upserts.push({ url, content: text, content_hash: hash, scraped_at: new Date().toISOString() })
      }
    }
    if (upserts.length > 0) {
      await supabase.from("source_cache").upsert(upserts, { onConflict: "url" })
    }
  }

  const { data: prevCache } = await supabase
    .from("source_cache")
    .select("url, content_hash")
    .in("url", staleUrls)

  const prevHashMap = new Map((prevCache ?? []).map((r: any) => [r.url, r.content_hash]))

  return urls
    .map((url) => cacheMap.get(url))
    .filter(Boolean)
    .filter((entry: any) => {
      if (staleUrls.includes(entry.url)) {
        const prev = prevHashMap.get(entry.url)
        return !prev || prev !== entry.content_hash
      }
      return false
    })
    .slice(0, 6)
    .map((entry: any) => `[${entry.url}]\n${entry.content}`)
    .join("\n\n")
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true"

  const rl = checkRateLimit(getRateLimitKey(req, "trends"), 5, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` }, { status: 429 })
  }

  try {
    // If not forced and we have fresh trends, return from DB
    if (!force) {
      const fresh = await hasFreshTrends()
      if (fresh) {
        const saved = await loadSavedTrends()
        if (saved.length > 0) return NextResponse.json({ trends: saved, cached: true })
      }
    }

    const settings = await getSettings()

    const provider = resolveProvider(settings?.ai_provider as AIProvider)
    console.log("[trends] provider:", provider)
    const topicClusters = settings?.topic_clusters ?? [
      "AI SDR 2026", "sales copilot productivity", "signal-based selling",
      "outbound automation", "B2B sales AI", "revenue operations",
    ]
    const trendSources = settings?.trend_sources ?? []

    const [redditPosts, extraContext] = await Promise.all([
      fetchRedditPosts(settings?.subreddits ?? []).catch(() => [] as RedditPost[]),
      trendSources.length > 0 ? scrapeSourceContent(trendSources).catch(() => "") : Promise.resolve(""),
    ])
    console.log(`[trends] Reddit posts fetched: ${redditPosts.length}`)

    const timeout = <T>(ms: number, fallback: T): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(fallback), ms))

    const [webTrends, redditTrends] = await Promise.allSettled([
      Promise.race([fetchWebSearchTrends(topicClusters, provider, settings?.trend_search_prompt), timeout(55_000, [] as Trend[])]),
      redditPosts.length > 0
        ? Promise.race([analyzeRedditTrends(redditPosts, provider), timeout(15_000, [] as Trend[])])
        : Promise.resolve([] as Trend[]),
    ])

    console.log("[trends] web:", webTrends.status === "fulfilled" ? webTrends.value.length + " trends" : "FAILED — " + webTrends.reason)
    console.log("[trends] reddit:", redditTrends.status === "fulfilled" ? redditTrends.value.length + " trends" : "FAILED — " + redditTrends.reason)

    const newTrends: Trend[] = [
      ...(webTrends.status === "fulfilled" ? webTrends.value : []),
      ...(redditTrends.status === "fulfilled" ? redditTrends.value : []),
    ]

    if (newTrends.length === 0) {
      // Return cached even if stale, rather than empty
      const saved = await loadSavedTrends()
      if (saved.length > 0) return NextResponse.json({ trends: saved, cached: true })
      return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 })
    }

    await saveTrends(newTrends).catch(console.error)

    // Return new + existing saved together
    const allSaved = await loadSavedTrends()
    const merged = allSaved.length > 0 ? allSaved : newTrends
    return NextResponse.json({ trends: merged })
  } catch (error) {
    console.error("Trends API error:", error)
    return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 })
  }
}
