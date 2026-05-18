import { z } from "zod"

export const GenerateRequestSchema = z.object({
  trend: z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    source: z.string(),
    relevanceScore: z.number(),
    velocity: z.enum(["hot", "rising", "stable"]),
    source_url: z.string().optional(),
    upvotes: z.number().nullable().optional(),
    comments: z.number().nullable().optional(),
    found_at: z.string().optional(),
  }),
  language: z.string().default("English"),
  tone: z.string(),
  postCount: z.number().int().min(1).max(10).default(3),
  postSize: z.string(),
  humanityLevel: z.number().int().min(1).max(5).default(3),
  userGuidance: z.string().optional(),
  includeCompetitor: z.boolean().default(false),
  manualContent: z.string().optional(),
})

export const RedditCommentRequestSchema = z.object({
  trendTitle: z.string().min(3, "Thread title must be at least 3 characters"),
  trendSummary: z.string().optional().default(""),
  trendUrl: z.string().optional().default(""),
  archetype: z.string().optional().default("auto"),
  noHarvey: z.boolean().optional().default(false),
  commentSize: z.enum(["short", "medium", "long"]).optional().default("medium"),
  instructions: z.string().optional().default(""),
})

export const LinkedInCommentRequestSchema = z.object({
  postContent: z.string().min(20, "Post content must be at least 20 characters"),
  archetype: z.string().optional().default("auto"),
  save: z.boolean().optional().default(false),
})

export const ResearchSummarizeRequestSchema = z.object({
  url: z.string().url("Must be a valid URL"),
})

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type RedditCommentRequest = z.infer<typeof RedditCommentRequestSchema>
export type LinkedInCommentRequest = z.infer<typeof LinkedInCommentRequestSchema>
export type ResearchSummarizeRequest = z.infer<typeof ResearchSummarizeRequestSchema>
