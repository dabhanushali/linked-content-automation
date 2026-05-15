"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Loader2, Copy, Check, Save, RefreshCw, Star, Trash2, Search, ArrowUpRight, MessageSquare, ThumbsUp } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { Trend } from "@/lib/types"
import { supabase } from "@/lib/supabase/client"

interface SavedComment {
  id: string
  platform: "reddit" | "linkedin"
  archetype: string
  original_content: string
  generated_comment: string
  word_count: number
  trend_title: string | null
  created_at: string
}

const REDDIT_ARCHETYPES = ["Auto (AI picks)", "Detailed Helper", "Tool Roundup", "Storyteller", "Myth Buster", "Mini-Guide"]
const LINKEDIN_ARCHETYPES = ["Auto (AI picks)", "Add a Layer", "The Bridge", "The Question", "The Data Drop", "Warm Congrats", "The Contrarian"]

interface RedditResult {
  comment: string
  archetype: string
  wordCount: number
  recommendedArchetype?: string
}

interface LinkedInVariant {
  archetype: string
  body: string
  wordCount: number
  recommended: boolean
}

interface LinkedInResult {
  variants: LinkedInVariant[]
  recommendedArchetype?: string
}

interface RedditSearchPost {
  id: string
  title: string
  author: string
  subreddit: string
  score: number
  num_comments: number
  url: string
  created_utc: number
  selftext: string
  upvote_ratio: number
}

function CommentsContent() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get("tab") === "linkedin" ? "linkedin" : "reddit"
  const trendId = searchParams.get("trendId")

  // Reddit state
  const [trendTitle, setTrendTitle] = useState("")
  const [trendSummary, setTrendSummary] = useState("")
  const [trendUrl, setTrendUrl] = useState("")
  const [redditArchetype, setRedditArchetype] = useState("Auto (AI picks)")
  const [noHarvey, setNoHarvey] = useState(false)
  const [commentSize, setCommentSize] = useState<"short" | "medium" | "long">("medium")
  const [generatingReddit, setGeneratingReddit] = useState(false)
  const [redditResult, setRedditResult] = useState<RedditResult | null>(null)
  const [copiedReddit, setCopiedReddit] = useState(false)

  // LinkedIn state
  const [postContent, setPostContent] = useState("")
  const [linkedinArchetype, setLinkedinArchetype] = useState("Auto (AI picks)")
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false)
  const [linkedinResult, setLinkedinResult] = useState<LinkedInResult | null>(null)
  const [copiedLinkedin, setCopiedLinkedin] = useState<number | null>(null)

  // History state
  const [historyComments, setHistoryComments] = useState<SavedComment[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [copiedHistory, setCopiedHistory] = useState<string | null>(null)

  // Reddit finder state
  const [finderKeywords, setFinderKeywords] = useState("")
  const [finderResults, setFinderResults] = useState<RedditSearchPost[]>([])
  const [finderLoading, setFinderLoading] = useState(false)
  const [finderSearched, setFinderSearched] = useState(false)
  const [activeTab, setActiveTab] = useState(defaultTab)

  const loadHistory = async () => {
    if (historyLoading) return
    setHistoryLoading(true)
    try {
      const res = await fetch("/api/comments")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setHistoryComments(data.comments ?? [])
      setHistoryLoaded(true)
    } catch {
      toast({ title: "Failed to load history", variant: "destructive" })
    } finally {
      setHistoryLoading(false)
    }
  }

  const deleteComment = async (id: string) => {
    setHistoryComments((prev) => prev.filter((c) => c.id !== id))
  }

  // Pre-fill from sessionStorage if redirected from trend card
  useEffect(() => {
    if (!trendId) return
    const stored = sessionStorage.getItem("selectedTrend")
    if (stored) {
      const trend: Trend = JSON.parse(stored)
      if (trend.id === trendId) {
        setTrendTitle(trend.title)
        setTrendSummary(trend.summary)
        setTrendUrl(trend.source_url ?? "")
      }
    }
  }, [trendId])

  const generateRedditComment = async () => {
    if (!trendTitle.trim()) return
    setGeneratingReddit(true)
    setRedditResult(null)
    try {
      const res = await fetch("/api/comments/reddit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trendTitle,
          trendSummary,
          trendUrl,
          archetype: redditArchetype === "Auto (AI picks)" ? "auto" : redditArchetype,
          noHarvey,
          commentSize,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setRedditResult(data)
    } catch {
      toast({ title: "Generation failed", variant: "destructive" })
    } finally {
      setGeneratingReddit(false)
    }
  }

  const handleSaveReddit = async () => {
    if (!redditResult) return
    const { error } = await supabase.from("comments").insert({
      platform: "reddit",
      archetype: redditResult.archetype,
      original_content: `${trendTitle}\n${trendSummary}`,
      generated_comment: redditResult.comment,
      word_count: redditResult.wordCount,
      trend_title: trendTitle,
    })
    if (error) toast({ title: "Failed to save", variant: "destructive" })
    else toast({ title: "Comment saved" })
  }

  const generateLinkedinComments = async () => {
    if (!postContent.trim()) return
    setGeneratingLinkedin(true)
    setLinkedinResult(null)
    try {
      const res = await fetch("/api/comments/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postContent,
          archetype: linkedinArchetype === "Auto (AI picks)" ? "auto" : linkedinArchetype,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLinkedinResult(data)
    } catch {
      toast({ title: "Generation failed", variant: "destructive" })
    } finally {
      setGeneratingLinkedin(false)
    }
  }

  const handleSaveLinkedin = async () => {
    if (!linkedinResult) return
    for (const v of linkedinResult.variants ?? []) {
      const { error } = await supabase.from("comments").insert({
        platform: "linkedin",
        archetype: v.archetype,
        original_content: postContent,
        generated_comment: v.body,
        word_count: v.wordCount,
      })
      if (error) console.error(error)
    }
    toast({ title: "Comments saved" })
  }

  const copyReddit = () => {
    if (!redditResult) return
    navigator.clipboard.writeText(redditResult.comment)
    setCopiedReddit(true)
    setTimeout(() => setCopiedReddit(false), 2000)
  }

  const copyLinkedin = (idx: number, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedLinkedin(idx)
    setTimeout(() => setCopiedLinkedin(null), 2000)
  }

  const searchRedditPosts = async () => {
    if (!finderKeywords.trim()) return
    setFinderLoading(true)
    setFinderSearched(false)
    try {
      const res = await fetch("/api/reddit/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: finderKeywords }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setFinderResults(data.posts ?? [])
      setFinderSearched(true)
    } catch {
      toast({ title: "Search failed", variant: "destructive" })
    } finally {
      setFinderLoading(false)
    }
  }

  const useThreadForComment = (post: RedditSearchPost) => {
    setTrendTitle(post.title)
    setTrendSummary(post.selftext || `r/${post.subreddit} · ${post.score} upvotes · ${post.num_comments} comments`)
    setTrendUrl(post.url)
    setActiveTab("reddit")
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Comment Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate engaging comments for Reddit threads and LinkedIn posts</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === "history" && !historyLoaded) loadHistory() }}>
        <TabsList className="grid w-full grid-cols-4 max-w-md">
          <TabsTrigger value="reddit">Reddit</TabsTrigger>
          <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
          <TabsTrigger value="finder">Find Threads</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Reddit Tab */}
        <TabsContent value="reddit" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
            {/* Left: inputs */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Thread Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Thread Title <span className="text-destructive">*</span></Label>
                  <Input
                    value={trendTitle}
                    onChange={(e) => setTrendTitle(e.target.value)}
                    placeholder="What is the thread about?"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Thread Summary / Context</Label>
                  <Textarea
                    value={trendSummary}
                    onChange={(e) => setTrendSummary(e.target.value)}
                    placeholder="Key points from the thread..."
                    className="resize-none min-h-[80px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Thread URL</Label>
                  <Input
                    value={trendUrl}
                    onChange={(e) => setTrendUrl(e.target.value)}
                    placeholder="https://reddit.com/r/..."
                  />
                  {trendId && !trendUrl && (
                    <p className="text-xs text-muted-foreground">URL not available for this trend — paste it manually.</p>
                  )}
                  {/* Subreddit-specific warnings */}
                  {trendUrl.includes("r/SaaS") && (
                    <p className="text-xs text-yellow-500/80">⚠ r/SaaS bans direct self-promotion. Keep Harvey mention to disclosure-only or use Don't mention Harvey.</p>
                  )}
                  {trendUrl.includes("r/sales") && (
                    <p className="text-xs text-yellow-500/80">⚠ r/sales — value-first required. Product mentions only if directly solving OP's problem.</p>
                  )}
                  {trendUrl.includes("r/entrepreneur") && (
                    <p className="text-xs text-yellow-500/80">⚠ r/Entrepreneur — story and experience comments work best. Avoid tool lists.</p>
                  )}
                  {trendUrl.includes("r/startups") && (
                    <p className="text-xs text-blue-400/80">ℹ r/startups allows product mentions with disclosure. Keep it under 10% of the comment.</p>
                  )}
                </div>
                {/* Timing guidance */}
                <div className="rounded-md bg-muted/50 border border-border px-3 py-2 space-y-0.5">
                  <p className="text-xs font-medium text-foreground">Best posting times (Eastern)</p>
                  <p className="text-xs text-muted-foreground">6–9 AM · 12–2 PM · 7–9 PM</p>
                  <p className="text-xs text-muted-foreground">Post 30 min before peak for max early velocity. First 90 min determine reach.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Archetype</Label>
                  <Select value={redditArchetype} onValueChange={setRedditArchetype}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REDDIT_ARCHETYPES.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {redditArchetype === "Auto (AI picks)" && (
                    <p className="text-xs text-muted-foreground">AI will pick the best archetype and highlight it</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Comment Length</Label>
                  <Select value={commentSize} onValueChange={(v) => setCommentSize(v as "short" | "medium" | "long")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (50–100 words)</SelectItem>
                      <SelectItem value="medium">Medium (100–200 words)</SelectItem>
                      <SelectItem value="long">Long (200–350 words)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between py-1">
                  <Label className="text-sm text-muted-foreground">Don't mention Harvey</Label>
                  <Switch checked={noHarvey} onCheckedChange={setNoHarvey} />
                </div>
                <Button
                  onClick={generateRedditComment}
                  disabled={generatingReddit || !trendTitle.trim()}
                  className="w-full"
                >
                  {generatingReddit ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : "Generate Comment"}
                </Button>
              </CardContent>
            </Card>

            {/* Right: output */}
            <div className="space-y-4">
              {generatingReddit && !redditResult && (
                <Card className="bg-card border-border">
                  <CardContent className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                    <p className="text-muted-foreground">Writing your Reddit comment...</p>
                  </CardContent>
                </Card>
              )}
              {redditResult && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Generated Comment</CardTitle>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          {redditResult.recommendedArchetype && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                          {redditResult.archetype}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{redditResult.wordCount} words</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={generateRedditComment} disabled={generatingReddit}>
                          <RefreshCw className="h-3 w-3 mr-1" />Regenerate
                        </Button>
                        <Button variant="outline" size="sm" onClick={copyReddit}>
                          {copiedReddit ? <><Check className="h-3 w-3 mr-1" />Copied</> : <><Copy className="h-3 w-3 mr-1" />Copy</>}
                        </Button>
                        <Button size="sm" onClick={handleSaveReddit}>
                          <Save className="h-3 w-3 mr-1" />Save
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground bg-muted rounded-lg p-4">
                      {redditResult.comment}
                    </pre>
                  </CardContent>
                </Card>
              )}
              {!generatingReddit && !redditResult && (
                <Card className="bg-card border-border border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-sm text-muted-foreground">Fill in the thread details and click Generate Comment</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* LinkedIn Tab */}
        <TabsContent value="linkedin" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
            {/* Left: inputs */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">LinkedIn Post</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Paste the LinkedIn post <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Paste the full LinkedIn post text here..."
                    className="resize-none min-h-[160px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Archetype</Label>
                  <Select value={linkedinArchetype} onValueChange={setLinkedinArchetype}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINKEDIN_ARCHETYPES.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {linkedinArchetype === "Auto (AI picks)" && (
                    <p className="text-xs text-muted-foreground">AI picks best archetype — highlighted with ★</p>
                  )}
                </div>
                <Button
                  onClick={generateLinkedinComments}
                  disabled={generatingLinkedin || !postContent.trim()}
                  className="w-full"
                >
                  {generatingLinkedin ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : "Generate Comments"}
                </Button>
              </CardContent>
            </Card>

            {/* Right: output */}
            <div className="space-y-4">
              {generatingLinkedin && !linkedinResult && (
                <Card className="bg-card border-border">
                  <CardContent className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                    <p className="text-muted-foreground">Writing your LinkedIn comments...</p>
                  </CardContent>
                </Card>
              )}
              {linkedinResult && (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-muted-foreground">{linkedinResult.variants?.length} variants generated</h2>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={generateLinkedinComments} disabled={generatingLinkedin}>
                        <RefreshCw className="h-3 w-3 mr-1" />Regenerate
                      </Button>
                      <Button size="sm" onClick={handleSaveLinkedin}>
                        <Save className="h-3 w-3 mr-1" />Save All
                      </Button>
                    </div>
                  </div>
                  {linkedinResult.variants?.map((variant, idx) => (
                    <Card key={idx} className={`bg-card border-border ${variant.recommended ? "ring-1 ring-yellow-400/50" : ""}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="flex items-center gap-1">
                              {variant.recommended && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                              {variant.archetype}
                            </Badge>
                            {variant.recommended && <span className="text-xs text-yellow-400 font-medium">AI recommended</span>}
                            <Badge variant="outline" className="text-xs">{variant.wordCount} words</Badge>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => copyLinkedin(idx, variant.body)}>
                            {copiedLinkedin === idx ? <><Check className="h-3 w-3 mr-1" />Copied</> : <><Copy className="h-3 w-3 mr-1" />Copy</>}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground">
                          {variant.body}
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
              {!generatingLinkedin && !linkedinResult && (
                <Card className="bg-card border-border border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-sm text-muted-foreground">Paste a LinkedIn post and click Generate Comments</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Find Threads Tab */}
        <TabsContent value="finder" className="mt-6">
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Find Reddit Threads to Comment On</CardTitle>
                <p className="text-xs text-muted-foreground">Search B2B subreddits for high-engagement posts where a comment from Harvey adds value. Sorted by commenting opportunity (comments weight 2×).</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={finderKeywords}
                    onChange={(e) => setFinderKeywords(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchRedditPosts()}
                    placeholder="e.g. cold email, AI sales tools, pipeline management..."
                    className="flex-1"
                  />
                  <Button onClick={searchRedditPosts} disabled={finderLoading || !finderKeywords.trim()}>
                    {finderLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Searches: r/sales, r/SaaS, r/B2BMarketing, r/startups, r/Entrepreneur, r/artificial + more</p>
              </CardContent>
            </Card>

            {finderLoading && (
              <Card className="bg-card border-border">
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                  <p className="text-muted-foreground text-sm">Searching Reddit...</p>
                </CardContent>
              </Card>
            )}

            {finderSearched && finderResults.length === 0 && (
              <Card className="bg-card border-border border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No results found. Try different keywords or Reddit may be rate-limiting server requests.</p>
                </CardContent>
              </Card>
            )}

            {finderResults.map((post) => (
              <Card key={post.id} className="bg-card border-border hover:border-muted-foreground/40 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant="outline" className="text-xs text-orange-400 border-orange-500/30 shrink-0">
                          r/{post.subreddit}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.created_utc * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground leading-snug mb-2">{post.title}</p>
                      {post.selftext && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.selftext}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{post.score}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{post.num_comments} comments</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => useThreadForComment(post)}>
                        Comment
                      </Button>
                      <a href={post.url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="ghost" className="w-full text-muted-foreground">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                {historyLoaded ? `${historyComments.length} saved comments` : "Saved comments"}
              </h2>
              <Button variant="outline" size="sm" onClick={loadHistory} disabled={historyLoading}>
                <RefreshCw className={`h-3 w-3 mr-1 ${historyLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {historyLoading && !historyLoaded && (
              <Card className="bg-card border-border">
                <CardContent className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                  <p className="text-muted-foreground">Loading history...</p>
                </CardContent>
              </Card>
            )}

            {historyLoaded && historyComments.length === 0 && (
              <Card className="bg-card border-border border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-muted-foreground">No saved comments yet. Generate and save a comment to see it here.</p>
                </CardContent>
              </Card>
            )}

            {historyComments.map((comment) => (
              <Card key={comment.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${comment.platform === "reddit" ? "text-orange-400 border-orange-500/30" : "text-indigo-400 border-indigo-500/30"}`}>
                        {comment.platform === "reddit" ? "Reddit" : "LinkedIn"}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">{comment.archetype}</Badge>
                      <Badge variant="outline" className="text-xs">{comment.word_count} words</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(comment.generated_comment)
                          setCopiedHistory(comment.id)
                          setTimeout(() => setCopiedHistory(null), 2000)
                        }}
                      >
                        {copiedHistory === comment.id ? <><Check className="h-3 w-3 mr-1" />Copied</> : <><Copy className="h-3 w-3 mr-1" />Copy</>}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteComment(comment.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {comment.trend_title && (
                    <p className="text-xs text-muted-foreground truncate mt-1">Re: {comment.trend_title}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground bg-muted rounded-lg p-4">
                    {comment.generated_comment}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function CommentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <CommentsContent />
    </Suspense>
  )
}
