import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { scrapeReddit } from "@/lib/reddit/scraping"
import { resolveProvider, clusterRedditPostsIntoTopics, generateCategorizedQuestions, generatePosts, AIProvider } from "@/lib/ai"
import { getSettings } from "@/lib/settings"
import { ScrapingProvider, ScrapedPost } from "@/lib/reddit/types"

export async function POST(req: NextRequest) {
  // Rate limit: 10 scans/minute
  const rl = checkRateLimit(getRateLimitKey(req, "geo-keyword-scan"), 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const { phrase, provider = "puppeteer" } = body as {
      phrase: string
      provider?: ScrapingProvider
    }

    if (!phrase || typeof phrase !== "string" || phrase.trim().length < 2) {
      return NextResponse.json(
        { error: "phrase must be at least 2 characters long" },
        { status: 400 }
      )
    }

    // 1. Create a Keyword Scan record in pending/scanning status
    const { data: keywordRecord, error: insertError } = await supabase
      .from("geo_keywords")
      .insert({
        phrase: phrase.trim(),
        status: "scanning"
      })
      .select()
      .single()

    if (insertError || !keywordRecord) {
      console.error("[GEO Scan] Failed to insert keyword:", insertError)
      return NextResponse.json(
        { error: "Failed to initialize keyword scan record" },
        { status: 500 }
      )
    }

    const keywordId = keywordRecord.id

    try {
      // 2. Scrape Reddit using requested provider (e.g. Local Puppeteer, Apify, etc.)
      console.log(`[GEO Scan] Scraping Reddit for "${phrase}" using provider ${provider}`)
      const posts: ScrapedPost[] = await scrapeReddit({
        keywords: phrase.trim(),
        maxResults: 50,
        sort: "relevance",
        timeFilter: "all",
        provider
      })

      // 3. Save raw scraped posts into database
      if (posts.length > 0) {
        const postsToInsert = posts.map(p => ({
          id: p.reddit_id,
          keyword_id: keywordId,
          title: p.title,
          url: p.permalink,
          subreddit: p.subreddit,
          author: p.author,
          upvotes: p.score,
          num_comments: p.comment_count,
          created_utc: p.created_utc,
          selftext: p.selftext
        }))

        const { error: postsInsertError } = await supabase
          .from("geo_reddit_posts")
          .insert(postsToInsert)

        if (postsInsertError) {
          console.error("[GEO Scan] Failed to insert raw posts:", postsInsertError)
        }
      }

      // 4. Resolve AI provider settings
      const settings = await getSettings()
      const aiProvider = resolveProvider(settings?.ai_provider as AIProvider)

      // 5. Cluster Reddit posts semantically
      let clusters: Array<{ cluster_name: string; core_intent: string; summary: string; post_ids: string[] }> = []
      if (posts.length > 0) {
        console.log(`[GEO Scan] Semantic clustering of ${posts.length} posts via ${aiProvider}`)
        try {
          clusters = await clusterRedditPostsIntoTopics(posts, aiProvider)
          
          if (clusters.length > 0) {
            const clustersToInsert = clusters.map(c => {
              // Calculate rough hotness based on comments and posts
              const matchingPosts = posts.filter(p => c.post_ids.includes(p.reddit_id))
              const totalComments = matchingPosts.reduce((acc, curr) => acc + curr.comment_count, 0)
              const totalPosts = matchingPosts.length
              const hotness = totalPosts * 3 + totalComments * 0.5 // weight posts and comments

              return {
                keyword_id: keywordId,
                cluster_name: c.cluster_name,
                core_intent: c.core_intent,
                summary: c.summary,
                total_posts: totalPosts,
                total_comments: totalComments,
                hotness_score: parseFloat(hotness.toFixed(2)),
                post_ids: c.post_ids
              }
            })

            const { error: clustersInsertError } = await supabase
              .from("geo_clusters")
              .insert(clustersToInsert)

            if (clustersInsertError) {
              console.error("[GEO Scan] Failed to insert clusters:", clustersInsertError)
            }
          }
        } catch (clusterErr) {
          console.error("[GEO Scan] Semantic clustering failed:", clusterErr)
        }
      }

      // 6. Generate Multi-LLM GEO Topic recommendations
      console.log(`[GEO Scan] Generating Multi-LLM GEO recommendations via ${aiProvider}`)
      try {
        const systemPrompt = `You are a search engine advisory engine specializing in Generative Engine Optimization (GEO).
For the B2B target search keyword phrase: "${phrase.trim()}", generate exactly 8 highly targetable content topic titles and suggested unique angles that the major LLM-based search engines (Google Gemini, OpenAI ChatGPT, Anthropic Claude, Perplexity) would prioritize, cite, and recommend.
Provide:
- Exactly 2 suggestions for Google Gemini.
- Exactly 2 suggestions for OpenAI ChatGPT.
- Provide exactly 2 suggestions for Anthropic Claude.
- Provide exactly 2 suggestions for Perplexity.

For each topic suggestion, identify:
1. "source": exactly one of "gemini", "chatgpt", "claude", or "perplexity".
2. "topic_title": a highly targetable SEO-optimized blog title.
3. "suggested_angle": the specific unique angle recommended for that engine (e.g. data table, direct snippet response, comparative study, how-to breakdown).
4. "priority": "high", "medium", or "low".

Return ONLY a JSON object in this exact format (no markdown, just raw JSON wrapped in braces):
{
  "suggestions": [
    {
      "source": "gemini | chatgpt | claude | perplexity",
      "topic_title": "SEO Blog Title",
      "suggested_angle": "Unique angle breakdown...",
      "priority": "high | medium | low"
    }
  ]
}`

        const aiResponse = await generatePosts(systemPrompt, `Generate recommendations for keyword: ${phrase}`, aiProvider)
        
        let jsonText = aiResponse
        const match = aiResponse.match(/\{[\s\S]*\}/)
        if (match) jsonText = match[0]

        const parsed = JSON.parse(jsonText)
        const suggestions = parsed.suggestions || []

        if (suggestions.length > 0) {
          const suggestionsToInsert = suggestions.map((s: any) => ({
            keyword_id: keywordId,
            source: s.source,
            topic_title: s.topic_title,
            suggested_angle: s.suggested_angle,
            priority: s.priority || "medium"
          }))

          const { error: suggestionsError } = await supabase
            .from("geo_llm_suggestions")
            .insert(suggestionsToInsert)

          if (suggestionsError) {
            console.error("[GEO Scan] Failed to insert LLM suggestions:", suggestionsError)
          }
        }
      } catch (llmErr) {
        console.error("[GEO Scan] LLM recommendations generation failed:", llmErr)
      }

      // 6.5. Generate AI Intent Wheel Questions (Answer The Public style)
      console.log(`[GEO Scan] Generating AI Intent Wheel questions via ${aiProvider}`)
      let aiQuestions: any[] = []
      try {
        aiQuestions = await generateCategorizedQuestions(phrase.trim(), aiProvider)
      } catch (qErr) {
        console.error("[GEO Scan] Failed to generate AI categorized questions:", qErr)
      }

      // 7. Update Keyword record to completed and save AI questions
      await supabase
        .from("geo_keywords")
        .update({ 
          status: "completed",
          ai_questions_json: aiQuestions.length > 0 ? aiQuestions : null
        })
        .eq("id", keywordId)

      return NextResponse.json({
        keywordId,
        phrase,
        status: "completed",
        scraped_posts_count: posts.length,
        clusters_count: clusters.length
      })

    } catch (scanError) {
      // Set Keyword Scan as failed
      await supabase
        .from("geo_keywords")
        .update({ status: "failed" })
        .eq("id", keywordId)

      throw scanError
    }

  } catch (error) {
    console.error("[GEO Scan] Error running scan pipeline:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
