import { Trend } from "@/lib/types"
import { RedditPost } from "@/lib/reddit"
import { ScrapedPost, RedditInsights, GeoCluster } from "@/lib/reddit/types"
import * as anthropic from "./anthropic"
import * as openai from "./openai"

export type AIProvider = "anthropic" | "openai"

export function resolveProvider(requested?: AIProvider): AIProvider {
  const preferred = requested ?? (process.env.OPENAI_API_KEY ? "openai" : "anthropic")
  if (preferred === "anthropic" && !process.env.ANTHROPIC_API_KEY) return "openai"
  if (preferred === "openai" && !process.env.OPENAI_API_KEY) return "anthropic"
  return preferred
}

export async function fetchWebSearchTrends(topicClusters: string[], provider: AIProvider, customPrompt?: string): Promise<Trend[]> {
  return provider === "openai"
    ? openai.fetchWebSearchTrends(topicClusters, customPrompt)
    : anthropic.fetchWebSearchTrends(topicClusters, customPrompt)
}

export async function analyzeRedditTrends(posts: RedditPost[], provider: AIProvider): Promise<Trend[]> {
  return provider === "openai"
    ? openai.analyzeRedditTrends(posts)
    : anthropic.analyzeRedditTrends(posts)
}

export async function generatePosts(systemPrompt: string, userPrompt: string, provider: AIProvider): Promise<string> {
  return provider === "openai"
    ? openai.generatePostsWithOpenAI(systemPrompt, userPrompt)
    : anthropic.generatePostsWithAnthropic(systemPrompt, userPrompt)
}

export async function extractPdf(file: File, provider: AIProvider): Promise<string> {
  return provider === "openai"
    ? openai.extractPdfWithOpenAI(file)
    : anthropic.extractPdfWithAnthropic(file)
}

export async function cleanSubredditRules(rawRules: string, provider: AIProvider): Promise<string> {
  const systemPrompt = `You are a text cleaning assistant. Your job is to take raw subreddit rules and reformat them into a clean, concise summary that can be used as context for content generation. Remove redundant text, fix formatting, and organize the rules clearly. Output ONLY the cleaned rules text, nothing else.`
  const userPrompt = `Clean and organize these subreddit rules:\n\n${rawRules}`
  return generatePosts(systemPrompt, userPrompt, provider)
}

export async function generateRedditInsights(
  posts: ScrapedPost[],
  provider: AIProvider
): Promise<RedditInsights> {
  return provider === "openai"
    ? openai.generateRedditInsights(posts)
    : anthropic.generateRedditInsights(posts)
}

export async function clusterRedditPostsIntoTopics(
  posts: ScrapedPost[],
  provider: AIProvider
): Promise<Array<{
  cluster_name: string
  core_intent: "informational" | "commercial" | "transactional"
  summary: string
  post_ids: string[]
}>> {
  return provider === "openai"
    ? openai.clusterRedditPostsIntoTopics(posts)
    : anthropic.clusterRedditPostsIntoTopics(posts)
}

export async function evaluateContentCoverage(
  clusters: GeoCluster[],
  sitemapBlogs: Array<{ url: string; title: string; meta_description: string | null }>,
  provider: AIProvider
): Promise<Array<{ url: string; coverage_status: "uncovered" | "needs_optimization" | "covered"; matching_cluster_id: string | null }>> {
  return provider === "openai"
    ? openai.evaluateContentCoverage(clusters, sitemapBlogs)
    : anthropic.evaluateContentCoverage(clusters, sitemapBlogs)
}

export async function generateGeoBrief(
  cluster: GeoCluster,
  keyword: string,
  provider: AIProvider
): Promise<string> {
  return provider === "openai"
    ? openai.generateGeoBrief(cluster, keyword)
    : anthropic.generateGeoBrief(cluster, keyword)
}

export async function generateCategorizedQuestions(
  phrase: string,
  provider: AIProvider
): Promise<Array<{
  question: string
  search_intent: "informational" | "commercial" | "navigational"
  motive_summary: string
}>> {
  return provider === "openai"
    ? openai.generateCategorizedQuestions(phrase)
    : anthropic.generateCategorizedQuestions(phrase)
}
