import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { resolveProvider, generateGeoBrief, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"
import { GeoCluster } from "@/lib/reddit/types"

export async function POST(req: NextRequest) {
  // Rate limit: 15 briefs/minute
  const rl = checkRateLimit(getRateLimitKey(req, "geo-brief-generate"), 15, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const { clusterId, question, keywordId } = body as { clusterId?: string; question?: string; keywordId?: string }

    if (!clusterId && (!question || !keywordId)) {
      return NextResponse.json(
        { error: "clusterId OR (question and keywordId) is required" },
        { status: 400 }
      )
    }

    let clusterName = ""
    let coreIntent = "informational"
    let summary = ""
    let keywordPhrase = ""

    if (clusterId) {
      // 1. Fetch geo_cluster
      const { data: cluster, error: clusterError } = await supabase
        .from("geo_clusters")
        .select("*")
        .eq("id", clusterId)
        .single()

      if (clusterError || !cluster) {
        return NextResponse.json(
          { error: "Topic cluster not found" },
          { status: 404 }
        )
      }

      clusterName = cluster.cluster_name
      coreIntent = cluster.core_intent
      summary = cluster.summary || ""

      // 2. Fetch associated phrase from geo_keywords
      const { data: keyword, error: keywordError } = await supabase
        .from("geo_keywords")
        .select("phrase")
        .eq("id", cluster.keyword_id)
        .single()

      if (keywordError || !keyword) {
        return NextResponse.json(
          { error: "Keyword phrase not found" },
          { status: 404 }
        )
      }
      keywordPhrase = keyword.phrase
    } else {
      // Custom AI Intent Question Brief
      const { data: keyword, error: keywordError } = await supabase
        .from("geo_keywords")
        .select("phrase")
        .eq("id", keywordId)
        .single()

      if (keywordError || !keyword) {
        return NextResponse.json(
          { error: "Keyword phrase not found" },
          { status: 404 }
        )
      }

      keywordPhrase = keyword.phrase
      clusterName = question!
      coreIntent = "informational"
      summary = `Comprehensive guide answering the target audience query: "${question}" in relation to "${keywordPhrase}".`
    }

    // 3. Resolve AI provider
    const settings = await getSettings()
    const aiProvider = resolveProvider(settings?.ai_provider as AIProvider)

    // 4. Generate premium GEO brief
    console.log(`[GEO Brief] Generating outline for target "${clusterName}" via ${aiProvider}`)
    const dummyCluster = {
      cluster_name: clusterName,
      core_intent: coreIntent,
      summary
    } as any
    const briefMarkdown = await generateGeoBrief(dummyCluster, keywordPhrase, aiProvider)

    return NextResponse.json({
      clusterId: clusterId || "custom",
      cluster_name: clusterName,
      keyword: keywordPhrase,
      brief: briefMarkdown
    })

  } catch (error) {
    console.error("[GEO Brief Generate] Error drafting brief:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
