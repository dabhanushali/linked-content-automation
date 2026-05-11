import { supabase } from "@/lib/supabase/client"

export interface Settings {
  harvey_profile: string
  icp: string
  voice_rules: string
  topic_clusters: string[]
  competitors: string[]
  default_language: string
  ai_provider: "anthropic" | "openai"
  trend_sources?: string[]
  trend_refresh_time?: string
  subreddits?: string[]
  content_system_prompt?: string
  post_scorer_prompt?: string
  reddit_comment_prompt?: string
  linkedin_comment_prompt?: string
  trend_search_prompt?: string
}

export interface KnowledgeItem {
  id: string
  type: "pdf" | "url"
  name: string
  source_url: string | null
  content: string
  created_at: string
}

export async function getSettings(): Promise<Settings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single()

  if (error) return null
  return data
}

export async function getKnowledgeBase(): Promise<KnowledgeItem[]> {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return []
  return data
}

export interface PostExample {
  id: string
  content: string
  hook_text: string | null
  hook_type: string | null
  tone: string | null
  format: string | null
  char_count: number | null
  hashtag_count: number | null
  reactions: number | null
  comments: number | null
  reposts: number | null
  views: number | null
  media_type: string | null
  source_url: string | null
  engagement_tier: string | null
  why_it_works: string | null
  topic_tags: string[]
  source: string
  active: boolean
  created_at: string
}

export async function getPostExamples(): Promise<PostExample[]> {
  const { data, error } = await supabase
    .from("post_examples")
    .select("*")
    .eq("active", true)
    .order("reactions", { ascending: false })

  if (error) return []
  return data ?? []
}

let _cachedPrompt: string | null = null

export async function getCachedSystemPrompt(): Promise<string> {
  if (_cachedPrompt) return _cachedPrompt
  const [settings, knowledgeItems] = await Promise.all([getSettings(), getKnowledgeBase()])
  if (!settings) return ""
  _cachedPrompt = await buildSystemPrompt(settings, knowledgeItems)
  return _cachedPrompt
}

export function invalidateSystemPromptCache(): void {
  _cachedPrompt = null
}

export async function buildSystemPrompt(settings: Settings, knowledgeItems: KnowledgeItem[], tone?: string): Promise<string> {
  const DEFAULT_TEMPLATE = `You are Harvey's content AI.

About Harvey:
{{harvey_profile}}

Target Customer (ICP):
{{icp}}

Voice & Style Rules:
{{voice_rules}}

{{knowledge_base}}

{{writing_examples}}`

  let template = settings.content_system_prompt || DEFAULT_TEMPLATE

  // 1. Process Knowledge Base
  let kbContext = ""
  if (knowledgeItems.length > 0) {
    const CHARS_PER_ITEM = 4000
    const MAX_ITEMS = 10
    const TOTAL_BUDGET = 20000

    const selectedItems = knowledgeItems.slice(0, MAX_ITEMS)
    let totalChars = 0
    kbContext = selectedItems
      .filter((item) => {
        const chars = Math.min(item.content.length, CHARS_PER_ITEM)
        if (totalChars + chars > TOTAL_BUDGET) return false
        totalChars += chars
        return true
      })
      .map((item) => `--- ${item.name} ---\n${item.content.slice(0, CHARS_PER_ITEM)}`)
      .join("\n\n")
    
    if (kbContext) {
      kbContext = `Additional company context:\n${kbContext}`
    }
  }

  // 2. Process Writing Examples
  let examplesContext = ""
  const examples = await getPostExamples()
  if (examples.length > 0) {
    const ownExamples = examples.filter(e => e.source === "own")
    const curatedExamples = examples.filter(e => e.source !== "own")

    const ownToneMatches = tone ? ownExamples.filter(e => e.tone === tone).slice(0, 4) : []
    const ownOthers = ownExamples.filter(e => e.tone !== tone).slice(0, 4 - ownToneMatches.length)
    const selectedOwn = [...ownToneMatches, ...ownOthers]

    const remaining = 8 - selectedOwn.length
    const curatedToneMatches = tone ? curatedExamples.filter(e => e.tone === tone).slice(0, remaining) : []
    const curatedOthers = curatedExamples.filter(e => e.tone !== tone).slice(0, remaining - curatedToneMatches.length)
    const selectedCurated = [...curatedToneMatches, ...curatedOthers].slice(0, remaining)

    if (selectedOwn.length > 0) {
      examplesContext += `YOUR OWN VOICE — match this exact writing style:\n\n`
      for (const ex of selectedOwn) {
        const meta = [ex.tone, ex.hook_type, ex.reactions != null ? `${ex.reactions} reactions` : null].filter(Boolean).join(" | ")
        examplesContext += `[${meta}]\n`
        if (ex.why_it_works) examplesContext += `WHY IT WORKS: ${ex.why_it_works}\n`
        examplesContext += `---\n${ex.content}\n\n`
      }
    }

    if (selectedCurated.length > 0) {
      examplesContext += `STRUCTURAL TEMPLATES — study these for patterns:\n\n`
      for (const ex of selectedCurated) {
        const meta = [ex.tone, ex.hook_type, ex.reactions != null ? `${ex.reactions} reactions` : null].filter(Boolean).join(" | ")
        examplesContext += `[${meta}]\n`
        if (ex.why_it_works) examplesContext += `WHY IT WORKS: ${ex.why_it_works}\n`
        examplesContext += `---\n${ex.content}\n\n`
      }
    }
  }

  // 3. Assemble Final Prompt
  return template
    .replace("{{harvey_profile}}", settings.harvey_profile || "")
    .replace("{{icp}}", settings.icp || "")
    .replace("{{voice_rules}}", settings.voice_rules || "")
    .replace("{{knowledge_base}}", kbContext)
    .replace("{{writing_examples}}", examplesContext)
    .trim()
}
