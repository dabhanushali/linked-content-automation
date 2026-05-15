"use client"

import { useEffect, useState } from "react"
import { PenLine, Copy, Check, Loader2, Download, Newspaper, ExternalLink, TrendingUp, MessageSquare, ThumbsUp, ChevronLeft, ChevronRight, Trash2, AlertTriangle, Target, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tone } from "@/lib/types"
import type { DigestResult, WebFinding, PainPoint, HarveyRelevancePoint } from "@/lib/types"
import { toast } from "@/hooks/use-toast"

const tones: Tone[] = ["Direct & Bold", "Data-Driven", "Contrarian", "Storytelling", "HOW TO", "WHAT TO"]

const humanityLabels: Record<number, string> = {
  1: "Polished & structured",
  2: "Professional with warmth",
  3: "Balanced",
  4: "Conversational & personal",
  5: "Raw & human",
}

type PdfTheme = "dark" | "light" | "navy" | "forest"

const PDF_THEMES: { id: PdfTheme; label: string; bg: string; accent: string; text: string }[] = [
  { id: "dark",   label: "Dark",   bg: "#0A0A0F", accent: "#6366F1", text: "#F8F8FF" },
  { id: "light",  label: "Light",  bg: "#FFFFFF", accent: "#6366F1", text: "#0F0F1A" },
  { id: "navy",   label: "Navy",   bg: "#0D1B2A", accent: "#F59E0B", text: "#F0F4F8" },
  { id: "forest", label: "Forest", bg: "#0D1F17", accent: "#10B981", text: "#ECFDF5" },
]

const STAGES = [
  { key: "fetching",     label: "Fetching trends" },
  { key: "synthesizing", label: "Synthesizing signals" },
  { key: "reddit",       label: "Community intel" },
  { key: "harvey",       label: "Strategic implications" },
  { key: "executive",   label: "Executive summary" },
]

function getWeekLabel(offset: number) {
  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() + offset * 7)
  const start = new Date(end)
  start.setDate(start.getDate() - 7)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}

// Backward-compat helpers
function getFinding(item: WebFinding | string): WebFinding {
  if (typeof item === "string") return { signal: item, soWhat: "", nowWhat: "", tier: "media" }
  return item
}
function getPainPoint(item: PainPoint | string): PainPoint {
  if (typeof item === "string") return { painPoint: item }
  return item
}
function getRelevancePoint(item: HarveyRelevancePoint | string): HarveyRelevancePoint {
  if (typeof item === "string") return { finding: item, harveyAdvantage: "", urgency: "medium" }
  return item
}

const SIGNAL_CONFIG: Record<string, { label: string; className: string }> = {
  strong:   { label: "Strong Signal Week",  className: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  moderate: { label: "Moderate Signal",     className: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
  weak:     { label: "Low Signal",          className: "text-muted-foreground border-border bg-muted/30" },
}

const TIER_CONFIG: Record<string, { label: string; className: string }> = {
  analyst: { label: "Analyst",  className: "text-indigo-400 border-indigo-500/30" },
  vendor:  { label: "Vendor",   className: "text-yellow-400 border-yellow-500/30" },
  media:   { label: "Media",    className: "text-muted-foreground border-border" },
}

const URGENCY_CONFIG: Record<string, { label: string; dot: string }> = {
  high:   { label: "HIGH",   dot: "bg-red-500" },
  medium: { label: "MED",    dot: "bg-yellow-500" },
  low:    { label: "LOW",    dot: "bg-muted-foreground" },
}

const PRIORITY_CONFIG: Record<string, { label: string; className: string; border: string }> = {
  critical: { label: "CRITICAL", className: "text-red-400 border-red-500/30 bg-red-500/10", border: "border-l-red-500" },
  high:     { label: "HIGH",     className: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10", border: "border-l-yellow-500" },
  medium:   { label: "MEDIUM",   className: "text-muted-foreground border-border bg-muted/20", border: "border-l-border" },
}

const sentimentColors: Record<string, string> = {
  positive: "text-emerald-400 border-emerald-500/30",
  negative: "text-red-400 border-red-500/30",
  neutral:  "text-muted-foreground border-border",
  mixed:    "text-yellow-400 border-yellow-500/30",
}

interface DigestListItem {
  id: string
  week_range: string
  headline: string | null
  generated_at: string
}

export default function ResearchPage() {
  const [activeTab, setActiveTab] = useState("digest")

  // Digest state
  const [weekOffset, setWeekOffset] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [digestStage, setDigestStage] = useState<string | null>(null)
  const [digestMessage, setDigestMessage] = useState("")
  const [digest, setDigest] = useState<DigestResult | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<PdfTheme>("dark")
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Write Post state
  const [postTone, setPostTone] = useState<Tone>("Direct & Bold")
  const [postSize, setPostSize] = useState<"Short" | "Medium" | "Long">("Medium")
  const [postHumanity, setPostHumanity] = useState([3])
  const [includeHarvey, setIncludeHarvey] = useState(false)
  const [generatingPost, setGeneratingPost] = useState(false)
  const [generatedPost, setGeneratedPost] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [digestList, setDigestList] = useState<DigestListItem[]>([])
  const [selectedDigestId, setSelectedDigestId] = useState("")
  const [digestListLoading, setDigestListLoading] = useState(false)
  const [loadingDigestId, setLoadingDigestId] = useState<string | null>(null)
  const [deletingDigestId, setDeletingDigestId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const loadDigestList = () => {
    setDigestListLoading(true)
    fetch("/api/digest/list")
      .then((r) => r.json())
      .then((data) => {
        const list: DigestListItem[] = data.digests ?? []
        setDigestList(list)
        if (list.length > 0 && !selectedDigestId) setSelectedDigestId(list[0].id)
      })
      .catch(() => {})
      .finally(() => setDigestListLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setMounted(true); loadDigestList() }, [])

  const handleGenerateDigest = async () => {
    const { start } = getWeekLabel(weekOffset)
    setGenerating(true)
    setDigest(null)
    setDigestStage("fetching")
    setDigestMessage("")
    try {
      const res = await fetch(`/api/digest?weekStart=${encodeURIComponent(start.toISOString())}`)
      if (!res.ok) throw new Error("Failed to start digest")
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.type === "progress") { setDigestStage(msg.stage); setDigestMessage(msg.message) }
            else if (msg.type === "complete") { setDigest(msg.digest); loadDigestList() }
            else if (msg.type === "error") toast({ title: "Digest failed", description: msg.message, variant: "destructive" })
          } catch {}
        }
      }
    } catch {
      toast({ title: "Digest generation failed", description: "Check your API keys and try again.", variant: "destructive" })
    } finally {
      setGenerating(false)
      setDigestStage(null)
    }
  }

  const handleDownloadPdf = async () => {
    if (!digest) return
    setDownloadingPdf(true)
    try {
      const res = await fetch("/api/digest/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest, theme: selectedTheme }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `harvey-digest-${selectedTheme}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: "PDF generation failed", variant: "destructive" })
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleDeleteDigest = async (id: string) => {
    setDeletingDigestId(id)
    try {
      const res = await fetch(`/api/digest/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setDigestList((prev) => prev.filter((d) => d.id !== id))
      if (selectedDigestId === id) setSelectedDigestId("")
    } catch {
      toast({ title: "Failed to delete digest", variant: "destructive" })
    } finally {
      setDeletingDigestId(null)
    }
  }

  const handleLoadDigest = async (id: string) => {
    setLoadingDigestId(id)
    try {
      const res = await fetch(`/api/digest/${id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDigest(data.digest)
      setSelectedDigestId(id)
    } catch {
      toast({ title: "Failed to load digest", variant: "destructive" })
    } finally {
      setLoadingDigestId(null)
    }
  }

  const handleGeneratePost = async () => {
    if (!selectedDigestId) return
    setGeneratingPost(true)
    setGeneratedPost(null)
    try {
      const res = await fetch("/api/research/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestId: selectedDigestId, tone: postTone, humanityLevel: postHumanity[0], postSize, includeHarvey }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setGeneratedPost(data.content)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast({ title: "Failed to generate post", description: msg, variant: "destructive" })
    } finally {
      setGeneratingPost(false)
    }
  }

  const currentStageIdx = STAGES.findIndex((s) => s.key === digestStage)
  const weekInfo = getWeekLabel(weekOffset)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">News Digest</h1>
        <p className="text-sm text-muted-foreground mt-1">Weekly market intelligence digest and research-driven post writer.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-xs">
          <TabsTrigger value="digest"><Newspaper className="mr-1.5 h-3.5 w-3.5" />News Digest</TabsTrigger>
          <TabsTrigger value="post">Write Post</TabsTrigger>
        </TabsList>

        {/* ── Digest Tab ── */}
        <TabsContent value="digest" className="mt-6 space-y-5">
          {/* Header card */}
          <Card className="bg-card border-border">
            <CardContent className="pt-6 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Weekly Market Intelligence</h2>
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => { setWeekOffset((o) => o - 1); setDigest(null) }}
                      disabled={generating || weekOffset <= -12}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm text-muted-foreground px-2 min-w-[210px] text-center" suppressHydrationWarning>{mounted ? weekInfo.label : ""}</span>
                    <button
                      onClick={() => { setWeekOffset((o) => o + 1); setDigest(null) }}
                      disabled={generating || weekOffset >= 0}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <Button onClick={handleGenerateDigest} disabled={generating} size="lg" className="shrink-0">
                  {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</> : <><Newspaper className="mr-2 h-4 w-4" />Generate Digest</>}
                </Button>
              </div>
              {generating && (
                <div className="mt-6 space-y-3">
                  <div className="flex gap-2">
                    {STAGES.map((stage, i) => (
                      <div key={stage.key} className="flex-1">
                        <div className={`h-1 rounded-full transition-all ${i < currentStageIdx ? "bg-emerald-500" : i === currentStageIdx ? "bg-indigo-500 animate-pulse" : "bg-muted"}`} />
                        <p className={`text-xs mt-1.5 ${i === currentStageIdx ? "text-foreground" : "text-muted-foreground"}`}>{stage.label}</p>
                      </div>
                    ))}
                  </div>
                  {digestMessage && <p className="text-xs text-muted-foreground">{digestMessage}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {digest && (
            <>
              {/* Executive Summary */}
              {digest.executiveSummary && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs text-violet-400 border-violet-500/30">Executive Summary</Badge>
                      {digest.executiveSummary.signalStrength && (
                        <Badge variant="outline" className={`text-xs ${SIGNAL_CONFIG[digest.executiveSummary.signalStrength]?.className ?? ""}`}>
                          ● {SIGNAL_CONFIG[digest.executiveSummary.signalStrength]?.label}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-base mt-2">{digest.executiveSummary.headline}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {digest.executiveSummary.executiveOverview && (
                      <div className="rounded-lg border-l-2 border-indigo-500 bg-indigo-500/5 px-4 py-3">
                        <p className="text-sm text-foreground leading-relaxed">{digest.executiveSummary.executiveOverview}</p>
                      </div>
                    )}
                    {digest.executiveSummary.criticalFindings?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Critical Findings</p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {digest.executiveSummary.criticalFindings.slice(0, 3).map((f, i) => (
                            <div key={i} className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">Finding {i + 1}</p>
                              <p className="text-sm font-medium text-foreground leading-snug">{f.finding}</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">↳ {f.implication}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {digest.executiveSummary.marketOutlook && (
                      <div className="rounded-lg bg-muted/20 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Market Outlook</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{digest.executiveSummary.marketOutlook}</p>
                      </div>
                    )}
                    {digest.executiveSummary.topRecommendation && (
                      <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1">Top Recommendation</p>
                        <p className="text-sm font-medium text-foreground leading-snug">{digest.executiveSummary.topRecommendation}</p>
                      </div>
                    )}
                    {digest.executiveSummary.signalStrengthReason && (
                      <p className="text-xs text-muted-foreground/70">{digest.executiveSummary.signalStrengthReason}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Stats bar */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Web Articles", value: digest.webCount, icon: <TrendingUp className="h-4 w-4" /> },
                  { label: "Reddit Posts", value: digest.redditCount, icon: <MessageSquare className="h-4 w-4" /> },
                  { label: "Total Upvotes", value: digest.totalUpvotes.toLocaleString(), icon: <ThumbsUp className="h-4 w-4" /> },
                  { label: "Total Comments", value: digest.totalComments.toLocaleString(), icon: <MessageSquare className="h-4 w-4" /> },
                ].map((stat) => (
                  <Card key={stat.label} className="bg-card border-border">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">{stat.icon}<span className="text-xs">{stat.label}</span></div>
                      <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Market Signals */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <Badge variant="outline" className="text-xs text-indigo-400 border-indigo-500/30 w-fit">Market Signals</Badge>
                  <CardTitle className="text-base mt-2">{digest.webSynthesis.headline}</CardTitle>
                  {digest.webSynthesis.marketMovement && (
                    <p className="text-sm text-muted-foreground mt-1">{digest.webSynthesis.marketMovement}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {(digest.webSynthesis.keyFindings ?? []).map((item, i) => {
                      const f = getFinding(item)
                      const tierConf = TIER_CONFIG[f.tier] ?? TIER_CONFIG.media
                      return (
                        <div key={i} className="rounded-lg bg-muted/20 p-3 space-y-2">
                          <p className="text-sm font-medium text-foreground leading-snug">{f.signal}</p>
                          {f.soWhat && (
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span className="text-indigo-400 font-semibold shrink-0">So What</span>
                              <span className="leading-relaxed">{f.soWhat}</span>
                            </div>
                          )}
                          {f.nowWhat && (
                            <div className="flex gap-2 text-xs text-foreground">
                              <span className="text-emerald-400 font-semibold shrink-0">→ Action</span>
                              <span className="leading-relaxed">{f.nowWhat}</span>
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap pt-0.5">
                            <Badge variant="outline" className={`text-xs ${tierConf.className}`}>{tierConf.label}</Badge>
                            {f.velocity === "hot" && <Badge variant="outline" className="text-xs text-red-400 border-red-500/30">🔥 Hot</Badge>}
                            {f.velocity === "rising" && <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/30">↗ Rising</Badge>}
                            {f.publication && <Badge variant="outline" className="text-xs text-muted-foreground border-border">{f.publication}</Badge>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {digest.webSynthesis.notableStats?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Data Points</p>
                      <div className="grid gap-2">
                        {digest.webSynthesis.notableStats.map((s, i) => (
                          <div key={i} className="rounded bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">{s}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {digest.webSynthesis.marketRisks?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-red-400" />Market Risks
                      </p>
                      <div className="space-y-1.5">
                        {digest.webSynthesis.marketRisks.map((r, i) => (
                          <div key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                            <span className="text-red-400 shrink-0 mt-0.5">⚠</span><span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {digest.webSynthesis.trendingTopics?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {digest.webSynthesis.trendingTopics.map((t, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Community Intelligence */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs text-orange-400 border-orange-500/30">Practitioner Intelligence</Badge>
                    {(digest.redditPulse.overallSentiment ?? digest.redditPulse.sentiment) && (
                      <Badge variant="outline" className={`text-xs capitalize ${sentimentColors[(digest.redditPulse.overallSentiment ?? digest.redditPulse.sentiment) as string] ?? ""}`}>
                        {(digest.redditPulse.overallSentiment ?? digest.redditPulse.sentiment)}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base mt-2">{digest.redditPulse.headline}</CardTitle>
                  {digest.redditPulse.sentimentDriver && (
                    <p className="text-sm text-muted-foreground mt-1">{digest.redditPulse.sentimentDriver}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Community Pain Points</p>
                    <div className="space-y-2.5">
                      {(digest.redditPulse.communityPainPoints ?? []).map((item, i) => {
                        const p = getPainPoint(item)
                        return (
                          <div key={i} className="rounded-lg bg-muted/20 p-3 space-y-1.5">
                            <div className="flex gap-2.5">
                              <span className="text-orange-400 shrink-0 mt-0.5">·</span>
                              <p className="text-sm text-foreground font-medium leading-snug">{p.painPoint}</p>
                            </div>
                            {p.evidence && <p className="text-xs text-muted-foreground pl-4">Source: {p.evidence}</p>}
                            {p.practitionerQuote && <p className="text-xs text-muted-foreground/70 pl-4 italic">"{p.practitionerQuote}"</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {digest.redditPulse.subredditBreakdown?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Users className="h-3 w-3" />Community Breakdown
                      </p>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="grid grid-cols-[auto_40px_1fr] gap-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2 border-b border-border bg-muted/20">
                          <span>Subreddit</span><span className="text-right">Posts</span><span className="pl-3">Focus</span>
                        </div>
                        {digest.redditPulse.subredditBreakdown.map((sub, i) => (
                          <div key={i} className="grid grid-cols-[auto_40px_1fr] gap-0 px-3 py-2 border-b border-border last:border-0 text-sm">
                            <span className="text-orange-400 font-medium">r/{sub.name}</span>
                            <span className="text-muted-foreground text-right">{sub.postCount}</span>
                            <span className="text-muted-foreground pl-3 leading-snug">{sub.dominantTheme}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {digest.redditPulse.topDiscussions?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top Discussions</p>
                      <div className="space-y-1">
                        {digest.redditPulse.topDiscussions.slice(0, 5).map((d, i) => (
                          <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground line-clamp-1">{d.title}</p>
                              {d.whyItMatters && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">↳ {d.whyItMatters}</p>}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">▲ {d.upvotes ?? 0}</span>
                            <span className="text-xs text-muted-foreground shrink-0">💬 {d.comments ?? 0}</span>
                            {d.url && (
                              <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {digest.redditPulse.buyerSignals?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Buyer Signals</p>
                      <div className="space-y-1.5">
                        {digest.redditPulse.buyerSignals.map((s, i) => (
                          <div key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                            <span className="text-indigo-400 shrink-0 mt-0.5">→</span><span>{s}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {digest.redditPulse.keyInsights?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Insights</p>
                      <div className="space-y-2">
                        {digest.redditPulse.keyInsights.map((ins, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="text-orange-400 shrink-0 mt-0.5">→</span>
                            <span className="text-sm text-muted-foreground">{ins}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Strategic Implications */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30 w-fit">Strategic Implications</Badge>
                  <CardTitle className="text-base mt-2">{digest.harveyAngle.headline}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(digest.harveyAngle.marketOpportunity || digest.harveyAngle.competitiveContext) && (
                    <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
                      {digest.harveyAngle.marketOpportunity && (
                        <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Opportunity: </span>{digest.harveyAngle.marketOpportunity}</p>
                      )}
                      {digest.harveyAngle.competitiveContext && (
                        <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Competitive context: </span>{digest.harveyAngle.competitiveContext}</p>
                      )}
                    </div>
                  )}
                  <div className="space-y-3">
                    {(digest.harveyAngle.relevancePoints ?? []).map((item, i) => {
                      const p = getRelevancePoint(item)
                      const urgConf = URGENCY_CONFIG[p.urgency ?? "medium"] ?? URGENCY_CONFIG.medium
                      return (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${urgConf.dot}`}>{i + 1}</span>
                          </div>
                          <div className="space-y-1 flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground leading-snug">{p.finding}</p>
                            <p className="text-sm font-medium text-foreground leading-snug">{p.harveyAdvantage}</p>
                            {p.talkingPoint && (
                              <p className="text-xs text-emerald-400 leading-snug">→ Talking point: {p.talkingPoint}</p>
                            )}
                            <Badge variant="outline" className={`text-xs ${urgConf.dot === "bg-red-500" ? "text-red-400 border-red-500/30" : urgConf.dot === "bg-yellow-500" ? "text-yellow-400 border-yellow-500/30" : "text-muted-foreground border-border"}`}>
                              {urgConf.label}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {digest.harveyAngle.winConditions?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Target className="h-3 w-3 text-emerald-400" />Win Conditions
                      </p>
                      <div className="space-y-1.5">
                        {digest.harveyAngle.winConditions.map((w, i) => (
                          <div key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                            <span className="text-emerald-400 shrink-0">✓</span><span>{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {digest.harveyAngle.callToAction && (
                    <div className="mt-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
                      <p className="text-sm font-medium text-indigo-400">{digest.harveyAngle.callToAction}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recommendations */}
              {digest.executiveSummary?.recommendations?.length ? (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Recommendations</CardTitle>
                    <CardDescription>Priority-ranked actions for this week</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[...digest.executiveSummary.recommendations]
                      .sort((a, b) => ({ critical: 0, high: 1, medium: 2 }[a.priority] ?? 2) - ({ critical: 0, high: 1, medium: 2 }[b.priority] ?? 2))
                      .map((rec, i) => {
                        const conf = PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.medium
                        return (
                          <div key={i} className={`rounded-lg border-l-2 bg-muted/20 p-3 space-y-1.5 ${conf.border}`}>
                            <p className="text-sm font-medium text-foreground leading-snug">{rec.action}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{rec.rationale}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-xs ${conf.className}`}>{conf.label}</Badge>
                              <Badge variant="outline" className="text-xs text-muted-foreground border-border">{rec.timeframe}</Badge>
                            </div>
                          </div>
                        )
                      })}
                  </CardContent>
                </Card>
              ) : null}

              {/* Key Sources */}
              {digest.webSynthesis.sources?.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Key Sources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {digest.webSynthesis.sources.slice(0, 10).map((src, i) => {
                        const tc = TIER_CONFIG[src.tier ?? "media"] ?? TIER_CONFIG.media
                        return (
                          <div key={i} className="flex items-start gap-3">
                            <div className="flex flex-col gap-1 shrink-0">
                              <Badge variant="outline" className="text-xs shrink-0">{src.publication}</Badge>
                              {src.tier && <Badge variant="outline" className={`text-xs ${tc.className}`}>{tc.label}</Badge>}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-foreground line-clamp-1">{src.title}</p>
                              {src.url && (
                                <a href={src.url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5">
                                  <ExternalLink className="h-2.5 w-2.5" />
                                  <span className="truncate">{src.url}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* PDF Download */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Download Report as PDF</CardTitle>
                  <CardDescription>6-page report: Cover · Executive Summary · Market Signals · Community Intelligence · Strategic Implications · Recommendations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Choose Design</p>
                    <div className="flex gap-3">
                      {PDF_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => setSelectedTheme(theme.id)}
                          title={theme.label}
                          className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all ${selectedTheme === theme.id ? "ring-2 ring-offset-2 ring-offset-card ring-foreground" : "opacity-60 hover:opacity-100"}`}
                        >
                          <div className="w-16 h-16 rounded-md flex flex-col overflow-hidden" style={{ backgroundColor: theme.bg }}>
                            <div style={{ height: 3, backgroundColor: theme.accent, flexShrink: 0 }} />
                            <div className="flex-1 flex flex-col justify-center px-2 gap-1">
                              <div style={{ height: 3, borderRadius: 2, backgroundColor: theme.text, opacity: 0.9, width: "70%" }} />
                              <div style={{ height: 2, borderRadius: 2, backgroundColor: theme.text, opacity: 0.4, width: "55%" }} />
                              <div style={{ height: 2, borderRadius: 2, backgroundColor: theme.text, opacity: 0.4, width: "40%" }} />
                              <div style={{ height: 2, borderRadius: 1, backgroundColor: theme.accent, width: "30%", marginTop: 3 }} />
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">{theme.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleDownloadPdf} disabled={downloadingPdf} size="lg">
                    {downloadingPdf ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating PDF…</> : <><Download className="mr-2 h-4 w-4" />Download PDF</>}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {!generating && !digest && mounted && (
            <div className="space-y-4">
              {digestList.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Past Digests</CardTitle>
                    <CardDescription>Previously generated reports — click to view</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {digestList.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{d.week_range}</p>
                          {d.headline && <p className="text-xs text-muted-foreground truncate mt-0.5">{d.headline}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => handleLoadDigest(d.id)} disabled={loadingDigestId === d.id || !!deletingDigestId}>
                            {loadingDigestId === d.id ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Loading…</> : "View"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteDigest(d.id)} disabled={deletingDigestId === d.id || !!loadingDigestId} className="text-muted-foreground hover:text-destructive">
                            {deletingDigestId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {digestList.length === 0 && !digestListLoading && (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-lg">
                  <Newspaper className="h-10 w-10 text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-medium text-muted-foreground">No digests yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">Click "Generate Digest" to synthesize the selected week's trends into a market intelligence report.</p>
                  <p className="text-xs text-muted-foreground mt-3">Make sure to refresh the dashboard first to get the latest trends.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Write Post Tab ── */}
        <TabsContent value="post" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Post Settings</CardTitle>
                <CardDescription>Generates a LinkedIn post summarising the key news and Reddit discussions from the selected digest period.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Select Digest</Label>
                  {digestListLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2"><Loader2 className="h-4 w-4 animate-spin" />Loading digests…</div>
                  ) : digestList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No digests yet. Generate one first.</p>
                  ) : (
                    <Select value={selectedDigestId} onValueChange={setSelectedDigestId}>
                      <SelectTrigger><SelectValue placeholder="Select a digest…" /></SelectTrigger>
                      <SelectContent>
                        {digestList.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.week_range}{d.headline ? ` — ${d.headline.length > 55 ? d.headline.slice(0, 55) + "…" : d.headline}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Tone</Label>
                  <Select value={postTone} onValueChange={(v) => setPostTone(v as Tone)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{tones.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Post Size</Label>
                  <Tabs value={postSize} onValueChange={(v) => setPostSize(v as "Short" | "Medium" | "Long")}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="Short">Short</TabsTrigger>
                      <TabsTrigger value="Medium">Medium</TabsTrigger>
                      <TabsTrigger value="Long">Long</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-muted-foreground">Humanity Level</Label>
                    <span className="text-xs text-muted-foreground">{humanityLabels[postHumanity[0]]}</span>
                  </div>
                  <Slider value={postHumanity} onValueChange={setPostHumanity} min={1} max={5} step={1} />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="harvey" checked={includeHarvey} onCheckedChange={setIncludeHarvey} />
                  <Label htmlFor="harvey" className="text-sm text-muted-foreground cursor-pointer">Include Harvey angle</Label>
                </div>
                <Button onClick={handleGeneratePost} disabled={generatingPost || !selectedDigestId} className="w-full" size="lg">
                  {generatingPost ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Writing…</> : <><PenLine className="mr-2 h-4 w-4" />Write Post</>}
                </Button>
              </CardContent>
            </Card>
            <div>
              {generatingPost && !generatedPost && (
                <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Writing your post…</span>
                </div>
              )}
              {generatedPost && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Generated Post</CardTitle>
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(generatedPost); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                        {copied ? <><Check className="mr-2 h-3 w-3" />Copied</> : <><Copy className="mr-2 h-3 w-3" />Copy</>}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground">{generatedPost}</pre>
                  </CardContent>
                </Card>
              )}
              {!generatingPost && !generatedPost && (
                <div className="flex items-center justify-center h-full min-h-[200px] border border-dashed border-border rounded-lg text-muted-foreground">
                  <div className="text-center space-y-2">
                    <PenLine className="h-8 w-8 mx-auto opacity-30" />
                    <p className="text-sm font-medium text-muted-foreground">Weekly news roundup post</p>
                    <p className="text-xs text-muted-foreground max-w-xs">Select a digest and click Write Post to generate a LinkedIn post that positions you as a trusted curator of this week's B2B sales & AI news.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
