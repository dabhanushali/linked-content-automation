import Anthropic from "@anthropic-ai/sdk"
import { Trend } from "@/lib/types"
import { RedditPost } from "@/lib/reddit"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function fetchWebSearchTrends(topicClusters: string[], customPrompt?: string): Promise<Trend[]> {
  let response: any
  const userPrompt = customPrompt 
    ? customPrompt.replace("{{topicClusters}}", topicClusters.join(", "))
    : `Search for the top 10 trending topics RIGHT NOW in AI sales, B2B sales technology, and sales automation in 2026.

Search for topics related to: ${topicClusters.join(", ")}.

Prioritise sources from TechCrunch, VentureBeat, Gartner, Forrester, McKinsey, HBR, Forbes, WSJ, SaaStr, a16z.

Return ONLY a JSON array of exactly 10 trend objects with source_url where available:
[{ "id": "ws-1", "title": "...", "summary": "...", "source": "Web Search", "relevanceScore": 8, "velocity": "hot", "source_url": "https://..." }]

Rules: id prefixed "ws-", relevanceScore 0-10, velocity: hot/rising/stable. Return ONLY the JSON array.`

  try {
    response = await client.beta.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      betas: ["web-search-2025-03-05" as any],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as any],
      messages: [{
        role: "user",
        content: userPrompt,
      }],
    })
  } catch (err: any) {
    console.error("[fetchWebSearchTrends] API call failed:", err?.status, err?.message, err?.error)
    throw err
  }

  const contentBlocks: any[] = Array.isArray(response.content) ? response.content : []

  // Extract URLs from web_search_tool_result blocks
  const urlsByTitle = new Map<string, string>()
  for (const block of contentBlocks) {
    if (block.type === "web_search_tool_result") {
      const results = Array.isArray(block.content) ? block.content : []
      for (const r of results) {
        if (r.url && r.title) urlsByTitle.set(r.title.toLowerCase(), r.url)
      }
    }
  }

  let jsonText = ""
  for (const block of contentBlocks) {
    if (block.type === "text") { jsonText = block.text ?? ""; break }
  }
  const match = jsonText.match(/\[[\s\S]*\]/)
  if (!match) throw new Error("No JSON in response")
  const trends: Trend[] = JSON.parse(match[0])

  // Fuzzy-match trend titles to extracted URLs
  return trends.map((t) => {
    if (t.source_url) return t
    const titleKey = t.title.toLowerCase()
    for (const [annotTitle, url] of urlsByTitle) {
      if (annotTitle.includes(titleKey.slice(0, 20)) || titleKey.includes(annotTitle.slice(0, 20))) {
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

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Summarize these Reddit posts as trends. For each post, write a clear and honest summary of what it is actually about — do not reframe or inject AI/sales language if it isn't there. Pick the top 4 most interesting posts.

${postList}

Return ONLY a JSON array of 4 objects with "sourceIndex" (1-based):
[{ "id": "rd-1", "sourceIndex": 1, "title": "...", "summary": "one honest sentence describing what this post is actually about", "source": "Reddit", "relevanceScore": 7, "velocity": "rising" }]

Rules: id prefixed "rd-", relevanceScore 0-10 (how relevant to B2B sales/SaaS practitioners), velocity: hot/rising/stable. Return ONLY the JSON array.`,
    }],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : ""
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

export async function generatePostsWithAnthropic(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  })
  return message.content[0].type === "text" ? message.content[0].text : ""
}

export async function extractPdfWithAnthropic(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as any,
        { type: "text", text: "Extract all key information: company description, product features, value proposition, target customers, competitive advantages, messaging. Return plain text only." },
      ],
    }],
  })
  return response.content[0].type === "text" ? response.content[0].text : ""
}
