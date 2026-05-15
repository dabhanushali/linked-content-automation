// Reddit Command Parser
// Deterministic regex-based extraction of structured intent from natural language commands.

import { ParsedIntent } from "@/lib/reddit/types"

export interface ParseCommandResult {
  subreddit: string | null
  keywords: string
  maxResults: number // capped at 50
  sort: "hot" | "new" | "top" | "rising" | "relevance"
  timeFilter: "day" | "week" | "month" | "year" | "all"
  isRedditSpecific: boolean
}

/**
 * Parses a natural language scraping command into structured intent.
 *
 * Examples:
 *   "Scrape top 10 posts about SEO from r/marketing" →
 *     { subreddit: "marketing", keywords: "SEO", maxResults: 10, sort: "top", timeFilter: "all", isRedditSpecific: true }
 *
 *   "Find 25 new posts about AI tools" →
 *     { subreddit: null, keywords: "AI tools", maxResults: 25, sort: "new", timeFilter: "all", isRedditSpecific: false }
 */
export function parseCommand(command: string): ParseCommandResult {
  // Extract subreddit reference
  const subredditMatch = command.match(/r\/(\w+)/i)
  const subreddit = subredditMatch ? subredditMatch[1] : null

  // Extract number (capped at 50) — ignore numbers that are part of time expressions
  const timeNumberPattern = /\d+\s*(?:hours?|hrs?|days?|weeks?|months?|years?)/i
  const cleanedForNumber = command.replace(timeNumberPattern, "")
  const numberMatch = cleanedForNumber.match(/(\d+)/)
  const rawNumber = numberMatch ? parseInt(numberMatch[1], 10) : 25
  const maxResults = Math.min(Math.max(rawNumber, 1), 50)

  // Extract sort indicator
  const sort = extractSort(command)

  // Extract time filter
  const timeFilter = extractTimeFilter(command)

  // Extract keywords (remove subreddit ref, numbers, sort/time words, filler words)
  const keywords = extractKeywords(command, subreddit)

  // Routing flag: true if command references a specific subreddit
  const isRedditSpecific = subreddit !== null

  return {
    subreddit,
    keywords,
    maxResults,
    sort,
    timeFilter,
    isRedditSpecific,
  }
}

function extractSort(command: string): ParseCommandResult["sort"] {
  const lower = command.toLowerCase()

  if (/\btop\b|\bbest\b/.test(lower)) return "top"
  if (/\bnew\b|\bnewest\b|\blatest\b/.test(lower)) return "new"
  if (/\bhot\b|\bhottest\b|\btrending\b/.test(lower)) return "hot"
  if (/\brising\b/.test(lower)) return "rising"

  return "relevance"
}

function extractTimeFilter(command: string): ParseCommandResult["timeFilter"] {
  const lower = command.toLowerCase()

  // Hour
  if (/\bpast hour\b|\blast hour\b|\b1 hour\b|\bone hour\b/.test(lower)) return "day"

  // Day (24 hours)
  if (/\brecent\b|\btoday\b|\bpast day\b|\blast day\b|\b24 hours?\b|\bpast 24\b|\blast 24\b|\byesterday\b/.test(lower)) return "day"

  // Week (7 days)
  if (/\bthis week\b|\bpast week\b|\blast week\b|\b7 days?\b|\bpast 7\b|\blast 7\b|\bweekly\b/.test(lower)) return "week"

  // Month (30 days)
  if (/\bthis month\b|\bpast month\b|\blast month\b|\b30 days?\b|\bpast 30\b|\blast 30\b|\bmonthly\b/.test(lower)) return "month"

  // Year (365 days)
  if (/\bthis year\b|\bpast year\b|\blast year\b|\b365 days?\b|\byearly\b/.test(lower)) return "year"

  // Fuzzy: "past X days" → map to closest bucket
  const daysMatch = lower.match(/(?:past|last)\s+(\d+)\s*days?/)
  if (daysMatch) {
    const days = parseInt(daysMatch[1])
    if (days <= 1) return "day"
    if (days <= 7) return "week"
    if (days <= 30) return "month"
    if (days <= 365) return "year"
    return "all"
  }

  // Fuzzy: "past X weeks" → map to closest bucket
  const weeksMatch = lower.match(/(?:past|last)\s+(\d+)\s*weeks?/)
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1])
    if (weeks <= 1) return "week"
    if (weeks <= 4) return "month"
    return "year"
  }

  // Fuzzy: "past X months" → map to closest bucket
  const monthsMatch = lower.match(/(?:past|last)\s+(\d+)\s*months?/)
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1])
    if (months <= 1) return "month"
    if (months <= 12) return "year"
    return "all"
  }

  return "all"
}

function extractKeywords(command: string, subreddit: string | null): string {
  let cleaned = command

  // Remove subreddit reference
  cleaned = cleaned.replace(/r\/\w+/gi, "")

  // Remove numbers
  cleaned = cleaned.replace(/\d+/g, "")

  // Remove sort indicators
  cleaned = cleaned.replace(/\b(top|best|new|newest|latest|hot|hottest|trending|rising)\b/gi, "")

  // Remove time indicators
  cleaned = cleaned.replace(
    /\b(recent|today|yesterday|past day|last day|this week|past week|last week|this month|past month|last month|this year|past year|last year|weekly|monthly|yearly)\b/gi,
    ""
  )

  // Remove numeric time expressions (e.g., "24 hours", "7 days", "3 weeks", "past 30 days")
  cleaned = cleaned.replace(/\b(?:past|last)?\s*\d+\s*(?:hours?|hrs?|days?|weeks?|months?|years?)\b/gi, "")

  // Remove orphaned time unit words (left after digit removal)
  cleaned = cleaned.replace(/\b(hours?|hrs?|days?|weeks?|months?|years?|minutes?|mins?)\b/gi, "")

  // Remove common filler words
  cleaned = cleaned.replace(
    /\b(scrape|find|get|fetch|search|show|give|me|the|from|about|posts|post|in|on|for|with|and|or|of|a|an|last|past|this)\b/gi,
    ""
  )

  // Collapse whitespace and trim
  cleaned = cleaned.replace(/\s+/g, " ").trim()

  return cleaned
}

/**
 * Converts a ParseCommandResult to a ParsedIntent (database-compatible format).
 */
export function toParseIntent(result: ParseCommandResult): ParsedIntent {
  return {
    subreddit: result.subreddit,
    keywords: result.keywords,
    max_results: result.maxResults,
    sort: result.sort,
    time_filter: result.timeFilter,
    is_reddit_specific: result.isRedditSpecific,
  }
}
