import OpenAI from "openai"
import { Trend } from "@/lib/types"
import { RedditPost } from "@/lib/reddit"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function fetchWebSearchTrends(topicClusters: string[], customPrompt?: string): Promise<Trend[]> {
  const userPrompt = customPrompt
    ? customPrompt.replace("{{topicClusters}}", topicClusters.join(", "))
    : `Search for the top 20 trending topics RIGHT NOW in AI sales, B2B sales technology, and sales automation in 2026.

Search for topics related to: ${topicClusters.join(", ")}.

Prioritise sources from TechCrunch, VentureBeat, Gartner, Forrester, McKinsey, HBR, Forbes, WSJ, SaaStr, a16z. Avoid SEO aggregator sites and content farms.

Return ONLY a JSON array of exactly 20 trend objects with source_url where available:
[{ "id": "ws-1", "title": "...", "summary": "...", "source": "Web Search", "relevanceScore": 8, "velocity": "hot", "source_url": "https://..." }]

Rules: id prefixed "ws-", relevanceScore 0-10, velocity: hot/rising/stable. Return ONLY the JSON array.`

  const response = await client.responses.create({
    model: "gpt-4o",
    max_output_tokens: 8000,
    tools: [{ type: "web_search_preview", search_context_size: "high" } as any],
    input: userPrompt,
  } as any)

  const text = (response as any).output_text ?? ""
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("No JSON in response")
  const trends: Trend[] = JSON.parse(match[0])

  // Extract URL citations from message annotations
  const output: any[] = (response as any).output ?? []
  const urlMap = new Map<string, string>()
  for (const item of output) {
    if (item.type === "message") {
      for (const contentBlock of item.content ?? []) {
        for (const annotation of contentBlock.annotations ?? []) {
          if (annotation.type === "url_citation" && annotation.url && annotation.title) {
            urlMap.set(annotation.title.toLowerCase(), annotation.url)
          }
        }
      }
    }
  }

  // Attach URLs to trends by title similarity
  return trends.map((t) => {
    if (t.source_url) return t
    const titleKey = t.title.toLowerCase()
    for (const [annotationTitle, url] of urlMap) {
      if (annotationTitle.includes(titleKey.slice(0, 20)) || titleKey.includes(annotationTitle.slice(0, 20))) {
        return { ...t, source_url: url }
      }
    }
    return t
  })
}

export async function analyzeRedditTrends(posts: RedditPost[]): Promise<Trend[]> {
  const postList = posts
    .map((p, i) => `${i + 1}. [r/${p.subreddit}] "${p.title}" (${p.score} upvotes, ${p.num_comments} comments)${p.selftext ? `\n   Context: ${p.selftext}` : ""}`)
    .join("\n\n")

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: `Summarize these Reddit posts as trends. For each post, write a clear and honest summary of what it is actually about — do not reframe or inject AI/sales language if it isn't there. Pick the top 4 most interesting posts.

${postList}

Return ONLY a JSON array of 4 objects with "sourceIndex" (1-based):
[{ "id": "rd-1", "sourceIndex": 1, "title": "...", "summary": "one honest sentence describing what this post is actually about", "source": "Reddit", "relevanceScore": 7, "velocity": "rising" }]

Rules: id prefixed "rd-", relevanceScore 0-10 (how relevant to B2B sales/SaaS practitioners), velocity: hot/rising/stable. Return ONLY the JSON array.`,
    }],
  })

  const text = response.choices[0]?.message?.content ?? ""
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  const raw = JSON.parse(match[0])
  return raw.map((t: any) => ({
    ...t,
    upvotes: posts[t.sourceIndex - 1]?.score,
    comments: posts[t.sourceIndex - 1]?.num_comments,
    source_url: posts[t.sourceIndex - 1]?.permalink,
  }))
}

export async function generatePostsWithOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  })
  return response.choices[0]?.message?.content ?? ""
}

export async function extractPdfWithOpenAI(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "file", file: { filename: file.name, file_data: `data:application/pdf;base64,${base64}` } } as any,
        { type: "text", text: "Extract all key information: company description, product features, value proposition, target customers, competitive advantages, messaging. Return plain text only." },
      ],
    }],
  })

  return response.choices[0]?.message?.content ?? ""
}
