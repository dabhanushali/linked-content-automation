import { NextRequest, NextResponse } from "next/server"
import { getSettings } from "@/lib/settings"
import { Trend } from "@/lib/types"
import { supabase } from "@/lib/supabase/client"
import { fetchWebSearchTrends, resolveProvider, AIProvider } from "@/lib/ai"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const settings = await getSettings()
    const provider = resolveProvider(settings?.ai_provider as AIProvider)
    const topicClusters = settings?.topic_clusters ?? [
      "AI SDR 2026", "sales copilot productivity", "signal-based selling",
      "outbound automation", "B2B sales AI", "revenue operations",
    ]

    // Check if the configured refresh time matches the current UTC time (within 30-minute window)
    // Skip this check if "force" query param is present (for manual testing)
    const forceRun = req.nextUrl.searchParams.get("force") === "true"

    if (!forceRun) {
      const refreshTime = settings?.trend_refresh_time ?? "06:00"
      const [configHour, configMin] = refreshTime.split(":").map(Number)
      const now = new Date()
      const utcHour = now.getUTCHours()
      const utcMin = now.getUTCMinutes()
      const configTotalMin = configHour * 60 + configMin
      const nowTotalMin = utcHour * 60 + utcMin

      // Handle midnight wraparound correctly
      const diff = Math.min(
        Math.abs(nowTotalMin - configTotalMin),
        24 * 60 - Math.abs(nowTotalMin - configTotalMin)
      )

      // Allow a 30-minute window around the configured time
      if (diff > 30) {
        return NextResponse.json({ ok: true, skipped: true, reason: "Outside scheduled window", configured: refreshTime, currentUTC: `${utcHour}:${utcMin}` })
      }
    }

    const trends = await fetchWebSearchTrends(topicClusters, provider)

    if (trends.length > 0) {
      const found_at = new Date().toISOString()
      const rows = trends.map((t: Trend) => ({
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

      const { error: insertError } = await supabase.from("trends").insert(rows)
      if (insertError) {
        console.error("Cron trends DB insert error:", insertError)
        return NextResponse.json({ error: "Failed to insert trends", details: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, count: trends.length })
  } catch (error: any) {
    console.error("Cron trends error:", error)
    return NextResponse.json({ error: "Failed to refresh trends", details: error?.message ?? "Unknown error" }, { status: 500 })
  }
}
