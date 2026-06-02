import OpenAI from "openai"
import { Trend } from "@/lib/types"
import { RedditPost } from "@/lib/reddit"
import { ScrapedPost, RedditInsights, GeoCluster } from "@/lib/reddit/types"

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

export async function generateRedditInsights(posts: ScrapedPost[]): Promise<RedditInsights> {
  const postList = posts
    .map((p, i) => `${i + 1}. [r/${p.subreddit}] "${p.title}" (ID: ${p.reddit_id}, Upvotes: ${p.score}, Comments: ${p.comment_count})\n   Content: ${p.selftext || "No body content"}`)
    .join("\n\n-------------------\n\n")

  const systemPrompt = `You are an expert market researcher and audience intelligence analyst.
Analyze the scraped Reddit posts and classify them into clear conversation topics or themes.
For each topic, identify:
- A descriptive name.
- A description of what is in their minds and what they are trying to say.
- Their core intent and motive (e.g. searching for solutions, venting, seeking advice, comparing options).
- The dominant sentiment (e.g. Frustrated, Skeptical, Curious, Enthusiastic).
- The exact list of post IDs (reddit_id) belonging to this topic. A post can belong to at most one topic.

Also provide 3-5 general takeaways for B2B sales teams or content creators based on this run.

Return ONLY a JSON object in this exact format (no markdown, no extra text):
{
  "topics": [
    {
      "id": "topic-1",
      "name": "Topic Name",
      "description": "What they are discussing...",
      "motiveIntent": "Their intent and motive...",
      "sentiment": "Dominant sentiment",
      "postIds": ["id1", "id2"]
    }
  ],
  "generalTakeaways": [
    "Takeaway 1...",
    "Takeaway 2..."
  ]
}`

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Here are the scraped Reddit posts to analyze:\n\n${postList}` }
    ],
    response_format: { type: "json_object" }
  })

  const text = response.choices[0]?.message?.content ?? ""
  return JSON.parse(text) as RedditInsights
}

export async function clusterRedditPostsIntoTopics(posts: ScrapedPost[]): Promise<Array<{
  cluster_name: string
  core_intent: "informational" | "commercial" | "transactional"
  summary: string
  post_ids: string[]
}>> {
  const postList = posts
    .map((p, i) => `${i + 1}. [r/${p.subreddit}] "${p.title}" (ID: ${p.reddit_id})\n   Content: ${p.selftext || "No body content"}`)
    .join("\n\n-------------------\n\n")

  const systemPrompt = `You are an expert audience intelligence researcher.
Analyze the scraped Reddit posts and group them into 3 to 5 cohesive semantic topic clusters based on what the users are searching for, asking, or discussing.
For each cluster:
- Assign a catchy, descriptive "cluster_name" (e.g. "Outsourcing Costs & Pricing Hacks").
- Identify its "core_intent": must be exactly one of "informational", "commercial", or "transactional".
- Provide a 2-3 sentence "summary" outlining the core problem, user mindset, and what they are seeking.
- Compile the exact list of "post_ids" that belong to this cluster. Every post can belong to at most one cluster.

Return ONLY a JSON object containing a "clusters" array in this exact format:
{
  "clusters": [
    {
      "cluster_name": "Cluster Title",
      "core_intent": "informational | commercial | transactional",
      "summary": "Detailed summary...",
      "post_ids": ["id1", "id2"]
    }
  ]
}`

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Here are the scraped Reddit posts to analyze and cluster:\n\n${postList}` }
    ],
    response_format: { type: "json_object" }
  })

  const text = response.choices[0]?.message?.content ?? ""
  const parsed = JSON.parse(text)
  return (parsed.clusters || []) as Array<{
    cluster_name: string
    core_intent: "informational" | "commercial" | "transactional"
    summary: string
    post_ids: string[]
  }>
}

export async function evaluateContentCoverage(
  clusters: GeoCluster[],
  sitemapBlogs: Array<{ url: string; title: string; meta_description: string | null }>
): Promise<Array<{ url: string; coverage_status: "uncovered" | "needs_optimization" | "covered"; matching_cluster_id: string | null }>> {
  const clusterData = clusters.map(c => `ID: ${c.id}\nTopic: "${c.cluster_name}"\nSummary: ${c.summary}`).join("\n\n")
  const blogData = sitemapBlogs.map((b, i) => `Index: ${i}\nURL: ${b.url}\nTitle: "${b.title}"\nDescription: ${b.meta_description || "None"}`).join("\n\n")

  const systemPrompt = `You are a semantic SEO auditor.
Your task is to match a website's existing blog pages against a set of target GEO topic clusters to identify content coverage and optimization gaps.
For each blog, compare its title and description against the topic clusters. Decide if it matches any cluster:
- If a blog closely answers the topic's intent, map it as "covered" and set the "matching_cluster_id" to that cluster's ID.
- If a blog is related but doesn't answer the specific questions or has shallow coverage, map it as "needs_optimization" and set "matching_cluster_id".
- Set "matching_cluster_id" to null and "coverage_status" to "uncovered" if no relationship is found.
*A blog can only match at most ONE cluster.*

Return ONLY a JSON object containing a "mappings" array in this exact format:
{
  "mappings": [
    {
      "url": "https://...",
      "coverage_status": "covered | needs_optimization | uncovered",
      "matching_cluster_id": "cluster-uuid-here-or-null"
    }
  ]
}`

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Target Topic Clusters:\n\n${clusterData}\n\nExisting Blogs:\n\n${blogData}` }
    ],
    response_format: { type: "json_object" }
  })

  const text = response.choices[0]?.message?.content ?? ""
  const parsed = JSON.parse(text)
  return (parsed.mappings || []) as Array<{
    url: string
    coverage_status: "uncovered" | "needs_optimization" | "covered"
    matching_cluster_id: string | null
  }>
}

export async function generateGeoBrief(cluster: GeoCluster, keyword: string): Promise<string> {
  const systemPrompt = `You are a world-class SEO strategist specializing in Generative Engine Optimization (GEO).
Draft a highly detailed, premium, and actionable blog post brief optimized specifically for LLM search citations (Gemini Search, ChatGPT Search, Perplexity) on the topic cluster: "${cluster.cluster_name}" (Primary Keyword: "${keyword}").

Structure the brief using Markdown, containing the following core sections:
1. **Target Intent & Angle**: Intent type (${cluster.core_intent}), psychological mindset, and the suggested differentiation angle.
2. **Featured Snippet Direct Answer**: A highly optimized, clear 2-3 sentence (under 50 words) direct-answer block styled for LLMs to scrape.
3. **Structured Q&A Sections**: At least 3 specific sub-headings with target answers addressing the direct questions users ask on forums.
4. **Structured Data Table**: A detailed comparative or structured data table template showing key points (pricing, comparisons, features).
5. **JSON-LD FAQ Schema**: A valid JSON-LD schema script block containing the questions and direct answers for CMS injection.
6. **Key LSI Keywords & Citations**: List of 10-15 latent semantic keywords to naturalize, along with recommended citations.

Focus on a professional, analytical, and highly structured format.`

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate a premium GEO brief for cluster: "${cluster.cluster_name}" (Intent: ${cluster.core_intent}). Summary: ${cluster.summary}` }
    ]
  })

  return response.choices[0]?.message?.content ?? ""
}

export async function generateCategorizedQuestions(phrase: string): Promise<Array<{
  question: string
  search_intent: "informational" | "commercial" | "navigational"
  motive_summary: string
}>> {
  const systemPrompt = `You are an expert search planner specializing in Generative Engine Optimization (GEO).
For the search term: "${phrase}", generate exactly 15 highly targetable search questions that real customers type into AI search engines.
Divide them equally into:
- Exactly 5 "informational" questions (understanding concepts, comparing frameworks, speed concerns).
- Exactly 5 "commercial" questions (hiring agencies, freelancers, pricing packages, vetting portfolios).
- Exactly 5 "navigational" questions (official documentation, starter templates, hosting, specific tool integrations).

For each question, define:
1. "question": The actual search query.
2. "search_intent": Must be exactly one of "informational", "commercial", or "navigational".
3. "motive_summary": A brief 1-sentence breakdown of what the customer is actually worried about or trying to achieve.

Return ONLY a JSON object containing a "questions" array in this exact format (no markdown, no extra text):
{
  "questions": [
    {
      "question": "Sample Query?",
      "search_intent": "informational | commercial | navigational",
      "motive_summary": "Brief motive description"
    }
  ]
}`

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate 15 categorized search questions for keyword: "${phrase}"` }
    ],
    response_format: { type: "json_object" }
  })

  const text = response.choices[0]?.message?.content ?? ""
  const parsed = JSON.parse(text)
  return (parsed.questions || []) as Array<{
    question: string
    search_intent: "informational" | "commercial" | "navigational"
    motive_summary: string
  }>
}

