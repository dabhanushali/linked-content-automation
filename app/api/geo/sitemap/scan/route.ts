import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { resolveProvider, evaluateContentCoverage, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"
import { GeoCluster } from "@/lib/reddit/types"

async function fetchPageMetadata(url: string): Promise<{ url: string; title: string; meta_description: string | null }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(6000)
    })
    if (!res.ok) {
      return { url, title: url.split("/").pop() || url, meta_description: null }
    }
    const html = await res.text()

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : (url.split("/").pop() || url)

    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i) ||
                      html.match(/<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i)
    const meta_description = descMatch ? descMatch[1].trim().replace(/&amp;/g, "&") : null

    return { url, title, meta_description }
  } catch (err) {
    console.warn(`[Sitemap Crawler] Failed to crawl page: ${url}`, err instanceof Error ? err.message : err)
    return { url, title: url.split("/").pop() || url, meta_description: null }
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 scans/minute
  const rl = checkRateLimit(getRateLimitKey(req, "geo-sitemap-scan"), 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const { keywordId, sitemapUrl, manualTitles = [] } = body as {
      keywordId: string
      sitemapUrl?: string
      manualTitles?: Array<{ url: string; title: string; meta_description: string | null }>
    }

    if (!keywordId) {
      return NextResponse.json(
        { error: "keywordId is required" },
        { status: 400 }
      )
    }

    // 1. Fetch geo_clusters from database
    const { data: clusters, error: clustersError } = await supabase
      .from("geo_clusters")
      .select("*")
      .eq("keyword_id", keywordId)

    if (clustersError || !clusters || clusters.length === 0) {
      return NextResponse.json(
        { error: "No topic clusters found for this keyword. Scan keyword first." },
        { status: 400 }
      )
    }

    let blogsToAudit: Array<{ url: string; title: string; meta_description: string | null }> = []

    // 2. Resolve content pool: crawling sitemap or parsing manual list
    if (manualTitles && manualTitles.length > 0) {
      blogsToAudit = manualTitles
    } else if (sitemapUrl) {
      console.log(`[Sitemap Scan] Crawling sitemap XML: ${sitemapUrl}`)
      try {
        const sitemapRes = await fetch(sitemapUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10000)
        })

        if (!sitemapRes.ok) {
          return NextResponse.json(
            { error: `Failed to fetch sitemap. HTTP status: ${sitemapRes.status}` },
            { status: 400 }
          )
        }

        const xmlText = await sitemapRes.text()
        const locs = xmlText.match(/<loc>(https?:\/\/[^<]+)<\/loc>/gi) || []
        let urls = locs.map(l => l.replace(/<\/?loc>/gi, "").trim())

        // Deduplicate and filter out common static paths (home, terms, login, tags)
        urls = Array.from(new Set(urls)).filter(u => {
          const lower = u.toLowerCase()
          return !lower.endsWith("/tags") && !lower.endsWith("/category") && !lower.endsWith("/author") &&
                 !lower.endsWith("/terms") && !lower.endsWith("/privacy") && !lower.endsWith("/login") &&
                 !lower.endsWith("/signup") && u.split("/").length > 3
        })

        if (urls.length === 0) {
          return NextResponse.json(
            { error: "Sitemap fetched, but no valid blog/article links were parsed." },
            { status: 400 }
          )
        }

        // Cap to the first 15 blog pages for speed and stability
        const targetUrls = urls.slice(0, 15)
        console.log(`[Sitemap Scan] Crawling metadata for first ${targetUrls.length} pages...`)

        blogsToAudit = await Promise.all(targetUrls.map(u => fetchPageMetadata(u)))
      } catch (xmlError) {
        console.error("[Sitemap Scan] XML sitemap fetch failed:", xmlError)
        return NextResponse.json(
          { error: "Failed to download sitemap. Try pasting blog titles manually." },
          { status: 400 }
        )
      }
    }

    if (blogsToAudit.length === 0) {
      return NextResponse.json(
        { error: "No pages found to index. Provide a valid sitemapUrl or manualTitles list." },
        { status: 400 }
      )
    }

    // 3. Resolve AI provider
    const settings = await getSettings()
    const aiProvider = resolveProvider(settings?.ai_provider as AIProvider)

    // 4. Run semantic coverage evaluation
    console.log(`[Sitemap Scan] Auditing ${blogsToAudit.length} blogs against ${clusters.length} clusters using ${aiProvider}`)
    const auditMappings = await evaluateContentCoverage(clusters as GeoCluster[], blogsToAudit, aiProvider)

    // 5. Delete old indexed pages for this keyword to avoid stale results
    await supabase
      .from("geo_website_index")
      .delete()
      .eq("keyword_id", keywordId)

    // 6. Insert fresh coverage mappings into database
    const indexRecords = blogsToAudit.map(blog => {
      const match = auditMappings.find(m => m.url === blog.url)
      const coverageStatus = match?.coverage_status || "uncovered"
      const matchedId = match?.matching_cluster_id && match.matching_cluster_id !== "null" ? match.matching_cluster_id : null

      return {
        keyword_id: keywordId,
        url: blog.url,
        title: blog.title,
        meta_description: blog.meta_description,
        matching_cluster_id: matchedId,
        coverage_status: coverageStatus
      }
    })

    const { error: insertError } = await supabase
      .from("geo_website_index")
      .insert(indexRecords)

    if (insertError) {
      console.error("[Sitemap Scan] Save index error:", insertError)
      return NextResponse.json(
        { error: "Semantic mappings completed, but failed to save index in database." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      audited_count: blogsToAudit.length,
      coverage: indexRecords
    })

  } catch (error) {
    console.error("[Sitemap Scan] Error running audit:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
