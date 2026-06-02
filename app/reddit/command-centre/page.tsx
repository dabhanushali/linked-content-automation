"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Send, BookmarkPlus, ExternalLink, Terminal, Search, TrendingUp, Hash, RefreshCw, Trash2, Pencil, MessageSquare, Sparkles, Lightbulb, Brain, Compass } from "lucide-react"
import { ScrapingProvider, ScrapedPost, ScrapeRun, RedditInsights } from "@/lib/reddit/types"

const quickCommands = [
  { icon: TrendingUp, label: "Top posts from a subreddit", command: "Scrape top 20 posts from r/" },
  { icon: Search, label: "Search for a topic", command: "Scrape posts about " },
  { icon: Hash, label: "Hot posts right now", command: "Scrape hot posts from r/" },
  { icon: Terminal, label: "New posts this week", command: "Scrape new posts this week from r/" },
]

export default function CommandCentrePage() {
  const [command, setCommand] = useState("")
  const [provider, setProvider] = useState<ScrapingProvider>("reddit_api")
  const [loading, setLoading] = useState(false)
  const [runs, setRuns] = useState<ScrapeRun[]>([])
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [editingRunId, setEditingRunId] = useState<string | null>(null)
  const [rerunningId, setRerunningId] = useState<string | null>(null)

  // Insights State
  const [activeTabs, setActiveTabs] = useState<Record<string, "posts" | "insights">>({})
  const [insights, setInsights] = useState<Record<string, RedditInsights>>({})
  const [insightsLoading, setInsightsLoading] = useState<Record<string, boolean>>({})
  const [insightsErrors, setInsightsErrors] = useState<Record<string, string>>({})
  const [activeTopicIndices, setActiveTopicIndices] = useState<Record<string, number>>({})

  async function loadInsights(runId: string, force: boolean = false) {
    if (insights[runId] && !force) return
    setInsightsLoading(prev => ({ ...prev, [runId]: true }))
    setInsightsErrors(prev => ({ ...prev, [runId]: "" }))
    try {
      const res = await fetch(`/api/reddit/scrape/insights?runId=${runId}${force ? "&force=true" : ""}`)
      const data = await res.json()
      if (!res.ok) {
        setInsightsErrors(prev => ({ ...prev, [runId]: data.error || "Failed to load insights" }))
      } else {
        setInsights(prev => ({ ...prev, [runId]: data.insights }))
        setActiveTopicIndices(prev => ({ ...prev, [runId]: 0 }))
      }
    } catch {
      setInsightsErrors(prev => ({ ...prev, [runId]: "Network error loading insights" }))
    } finally {
      setInsightsLoading(prev => ({ ...prev, [runId]: false }))
    }
  }

  useEffect(() => { fetchRuns() }, [])

  async function fetchRuns() {
    try {
      const res = await fetch("/api/reddit/scrape/runs")
      if (res.ok) { const data = await res.json(); setRuns(data.runs || []) }
    } catch {}
  }

  async function handleSubmit() {
    if (!command.trim()) return
    setLoading(true); setError(null)
    try {
      // If editing, delete old run first
      if (editingRunId) {
        await fetch(`/api/reddit/scrape/runs?id=${editingRunId}`, { method: "DELETE" })
        setEditingRunId(null)
      }
      const res = await fetch("/api/reddit/scrape/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: command.trim(), provider }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Scrape command failed") }
      else { setCommand(""); await fetchRuns(); if (data.run_id) setExpandedRunId(data.run_id) }
    } catch (err) { setError(err instanceof Error ? err.message : "Network error") }
    finally { setLoading(false) }
  }

  async function handleSaveToLibrary(post: ScrapedPost, runId: string) {
    try {
      const res = await fetch("/api/reddit/engagement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: post.title, body: post.selftext, subreddit: post.subreddit, author: post.author, score: post.score, comment_count: post.comment_count, url: post.permalink.startsWith("http") ? post.permalink : `https://reddit.com${post.permalink}`, scrape_run_id: runId }) })
      if (res.ok) setSavedIds(prev => new Set([...prev, post.reddit_id]))
      else setError("Failed to save")
    } catch { setError("Failed to save") }
  }

  async function handleDeleteRun(id: string) {
    try {
      await fetch(`/api/reddit/scrape/runs?id=${id}`, { method: "DELETE" })
      setRuns(prev => prev.filter(r => r.id !== id))
      if (expandedRunId === id) setExpandedRunId(null)
    } catch { setError("Failed to delete run") }
  }

  async function handleRerun(cmd: string, oldRunId: string) {
    setRerunningId(oldRunId); setError(null)
    try {
      await fetch(`/api/reddit/scrape/runs?id=${oldRunId}`, { method: "DELETE" })
      const res = await fetch("/api/reddit/scrape/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd, provider }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Re-run failed") }
      else { await fetchRuns(); if (data.run_id) setExpandedRunId(data.run_id) }
    } catch { setError("Network error") }
    finally { setRerunningId(null) }
  }

  function parseResults(run: ScrapeRun): ScrapedPost[] {
    if (!run.results_json) return []
    try { return JSON.parse(run.results_json) } catch { return [] }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-4xl mx-auto relative">
      {/* Results Area — scrollable */}
      <div className="flex-1 overflow-y-auto pb-4 pr-1 scrollbar-thin">
        {runs.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in py-12">
            <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-6">
              <div className="absolute inset-0 rounded-2xl bg-accent/15 blur-md animate-pulse" />
              <Terminal className="h-6 w-6 text-accent relative z-10" />
            </div>
            <h2 className="text-xl font-bold mb-2 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Command Centre</h2>
            <p className="text-xs text-muted-foreground/80 max-w-md mb-8 font-medium">Type natural language commands to discover Reddit content and gather user patterns.</p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {quickCommands.map((qc, i) => (
                <button key={i} onClick={() => setCommand(qc.command)} className="flex items-start gap-3.5 p-4 rounded-2xl border border-border/10 bg-card/40 backdrop-blur-md hover:bg-accent/[0.02] hover:border-accent/30 hover:shadow-[0_4px_20px_-10px_rgba(var(--accent),0.1)] transition-all duration-300 text-left group">
                  <qc.icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors mt-0.5 shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">{qc.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && runs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in space-y-4 py-16">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse h-12 w-12" />
              <Loader2 className="h-8 w-8 animate-spin text-accent relative z-10" />
            </div>
            <p className="text-xs font-semibold tracking-wide text-foreground">Scraping Reddit threads...</p>
          </div>
        )}

        {runs.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Run History</h2>
              <span className="text-xs text-muted-foreground font-medium">{runs.length} runs</span>
            </div>
            {runs.map(run => {
              const isExpanded = expandedRunId === run.id
              const results = isExpanded ? parseResults(run) : []
              return (
                <div key={run.id} className="animate-slide-up">
                  <div className="flex items-center justify-between px-4.5 py-3 rounded-xl border border-border/15 bg-card/60 backdrop-blur-sm cursor-pointer hover:border-accent/35 hover:shadow-sm transition-all duration-300" onClick={() => setExpandedRunId(isExpanded ? null : run.id)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge 
                        variant={run.status === "complete" ? "default" : run.status === "failed" ? "destructive" : "secondary"} 
                        className="text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded shrink-0"
                      >
                        {run.status}
                      </Badge>
                      <span className="text-xs font-semibold truncate text-foreground">{run.command_text}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4 text-[11px] text-muted-foreground font-medium">
                      <span className="font-mono text-accent/80 text-[10px]">{run.actor_used || "reddit_api"}</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-border/40" />
                      <span className="font-bold text-foreground">{run.result_count} items</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-border/40" />
                      <span>{new Date(run.created_at).toLocaleDateString()}</span>
                      <div className="flex items-center gap-1.5 ml-2 border-l border-border/30 pl-2">
                        <button
                          className="p-1 rounded hover:bg-secondary/40 hover:text-foreground transition-all"
                          onClick={(e) => { e.stopPropagation(); handleRerun(run.command_text, run.id) }}
                          title="Re-run"
                          disabled={rerunningId === run.id}
                        >
                          <RefreshCw className={`h-3 w-3 ${rerunningId === run.id ? "animate-spin text-accent" : ""}`} />
                        </button>
                        <button
                          className="p-1 rounded hover:bg-secondary/40 hover:text-foreground transition-all"
                          onClick={(e) => { e.stopPropagation(); setEditingRunId(run.id); setCommand(run.command_text) }}
                          title="Edit & re-run"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          className="p-1 rounded hover:bg-secondary/40 hover:text-destructive transition-all"
                          onClick={(e) => { e.stopPropagation(); handleDeleteRun(run.id) }}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && run.status === "failed" && (
                    <div className="mt-2.5 pl-4 pr-4 py-4 rounded-xl border border-destructive/15 bg-destructive/[0.02] backdrop-blur-md animate-slide-down">
                      <div className="flex items-center gap-2 mb-2 text-destructive">
                        <Terminal className="h-4 w-4" />
                        <h4 className="text-[10px] font-black uppercase tracking-wider">Scrape Debugger Logs</h4>
                      </div>
                      <p className="text-xs text-foreground/95 font-mono bg-black/60 p-3.5 rounded-xl border border-border/10 whitespace-pre-wrap">
                        {run.results_json || "Unknown failure during scraping. Check your internet connection or API credentials."}
                      </p>
                      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground font-medium">
                        <span>Failed Method: <strong className="text-foreground uppercase">{run.actor_used || "reddit_api"}</strong></span>
                        <span>•</span>
                        <span>Recommendation: <span className="text-accent font-medium">{(run.results_json && (run.results_json.includes("403") || run.results_json.includes("blocked") || run.results_json.includes("Cloudflare"))) ? "Try toggling to 'Apify' or 'Tavily' which utilize residential proxies to bypass Cloudflare." : "Check your API keys and local chromium setup."}</span></span>
                      </div>
                    </div>
                  )}
                  {isExpanded && results.length > 0 && (
                    <div className="mt-3 pl-2 space-y-3 animate-slide-down">
                      {/* Tabs Bar */}
                      <div className="flex items-center justify-between border-b border-border/15 pb-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActiveTabs(prev => ({ ...prev, [run.id]: "posts" }))}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200 ${
                              (activeTabs[run.id] || "posts") === "posts"
                                ? "bg-accent/10 text-accent border border-accent/20"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Scraped Posts ({results.length})
                          </button>
                          <button
                            onClick={() => {
                              setActiveTabs(prev => ({ ...prev, [run.id]: "insights" }))
                              loadInsights(run.id)
                            }}
                            className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200 ${
                              activeTabs[run.id] === "insights"
                                ? "bg-accent/10 text-accent border border-accent/20 shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Sparkles className="h-3 w-3 text-accent animate-pulse" />
                            AI Insights
                          </button>
                        </div>
                        {activeTabs[run.id] === "insights" && insights[run.id] && !insightsLoading[run.id] && (
                          <button
                            onClick={() => loadInsights(run.id, true)}
                            className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors py-0.5 px-2 rounded-md hover:bg-secondary/60"
                            title="Re-generate Insights"
                          >
                            <RefreshCw className="h-2.5 w-2.5" />
                            Re-analyze
                          </button>
                        )}
                      </div>

                      {/* Content Area based on Active Tab */}
                      {(activeTabs[run.id] || "posts") === "posts" ? (
                        <div className="space-y-2">
                          {results.map((post, idx) => (
                            <div key={post.reddit_id || idx} className="flex items-start justify-between gap-3 rounded-xl border border-border/10 p-4 bg-card/45 hover:border-accent/20 transition-all duration-150 animate-slide-up">
                              <div className="min-w-0 space-y-1.5 flex-1">
                                <p className="text-xs font-bold leading-snug text-foreground">{post.title}</p>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                                  <span className="text-orange-500 font-bold">r/{post.subreddit}</span>
                                  <span>u/{post.author}</span>
                                  <span>{post.score}↑</span>
                                  <span>{post.comment_count} comments</span>
                                </div>
                                {post.selftext && <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-relaxed">{post.selftext}</p>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {post.permalink && (
                                  <a href={post.permalink.startsWith("http") ? post.permalink : `https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors">
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                  </a>
                                )}
                                <Button size="sm" variant={savedIds.has(post.reddit_id) ? "secondary" : "outline"} className="h-7 text-[10px] font-bold px-2 rounded-lg" onClick={(e) => { e.stopPropagation(); handleSaveToLibrary(post, run.id) }} disabled={savedIds.has(post.reddit_id)}>
                                  <BookmarkPlus className="h-3 w-3 mr-1 text-accent" />{savedIds.has(post.reddit_id) ? "Saved" : "Save"}
                                </Button>
                                <a href={`/reddit/comments?title=${encodeURIComponent(post.title)}&body=${encodeURIComponent(post.selftext?.slice(0, 500) || "")}&url=${encodeURIComponent(post.permalink.startsWith("http") ? post.permalink : `https://reddit.com${post.permalink}`)}`} className="inline-flex items-center h-7 px-2 text-[10px] font-bold rounded-lg border border-border/60 bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors" onClick={e => e.stopPropagation()}>
                                  <MessageSquare className="h-3 w-3 mr-1" />Comment
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // AI Insights View
                        <div className="space-y-4">
                          {insightsLoading[run.id] && (
                            <div className="p-8 space-y-4 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm animate-pulse">
                              <div className="flex items-center gap-3">
                                <Sparkles className="h-5 w-5 text-accent animate-spin" />
                                <div className="h-4 w-48 bg-muted rounded-md"></div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                <div className="col-span-1 space-y-2.5">
                                  <div className="h-14 bg-muted rounded-xl"></div>
                                  <div className="h-14 bg-muted rounded-xl"></div>
                                  <div className="h-14 bg-muted rounded-xl"></div>
                                </div>
                                <div className="col-span-2 space-y-3">
                                  <div className="h-32 bg-muted rounded-xl"></div>
                                  <div className="h-20 bg-muted rounded-xl"></div>
                                </div>
                              </div>
                            </div>
                          )}

                          {insightsErrors[run.id] && (
                            <div className="p-6 rounded-2xl border border-destructive/20 bg-destructive/10 text-center space-y-3">
                              <p className="text-xs text-destructive font-medium">{insightsErrors[run.id]}</p>
                              <Button size="sm" onClick={() => loadInsights(run.id, true)} className="h-8 text-xs bg-destructive text-white hover:bg-destructive/90">
                                <RefreshCw className="h-3 w-3 mr-1.5" /> Try Again
                              </Button>
                            </div>
                          )}

                          {!insightsLoading[run.id] && !insightsErrors[run.id] && insights[run.id] && (
                            <div className="space-y-4 animate-fade-in">
                              {/* Master-Detail Layout for Topics */}
                              {insights[run.id].topics.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                                  No topic patterns identified in this batch of posts.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Left Panel: Topics Selection */}
                                  <div className="col-span-1 flex flex-col gap-2.5">
                                    <h4 className="text-[9px] uppercase font-black tracking-wider text-muted-foreground/80 px-1">
                                      Classified Topics
                                    </h4>
                                    <div className="flex flex-col gap-2">
                                      {insights[run.id].topics.map((topic, tIdx) => {
                                        const isSelected = (activeTopicIndices[run.id] || 0) === tIdx
                                        const postIds = topic.postIds || (topic as any).post_ids || []
                                        return (
                                          <button
                                            key={topic.id}
                                            onClick={() => setActiveTopicIndices(prev => ({ ...prev, [run.id]: tIdx }))}
                                            className={`flex flex-col items-start text-left p-3.5 rounded-xl border transition-all duration-300 group relative overflow-hidden ${
                                              isSelected
                                                ? "bg-accent/10 border-accent/30 shadow-sm"
                                                : "bg-card/50 border-border/15 hover:border-accent/20 hover:bg-secondary/35"
                                            }`}
                                          >
                                            <div className="flex items-center justify-between w-full gap-2">
                                              <span className="text-xs font-bold truncate text-foreground group-hover:text-accent transition-colors leading-tight">
                                                {topic.name}
                                              </span>
                                              <span className="text-[9px] py-0.5 px-1.5 shrink-0 bg-accent/15 text-accent border border-accent/20 rounded font-bold">
                                                {postIds.length} posts
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1">
                                              <span className="text-[10px] text-muted-foreground truncate font-medium">
                                                {topic.sentiment}
                                              </span>
                                            </div>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  {/* Right Panel: Topic Details */}
                                  <div className="col-span-2">
                                    {(() => {
                                      const selectedTopic = insights[run.id].topics[activeTopicIndices[run.id] || 0]
                                      if (!selectedTopic) return null
                                      const selectedPostIds = selectedTopic.postIds || (selectedTopic as any).post_ids || []
                                      const matchedPosts = results.filter(p => selectedPostIds.includes(p.reddit_id))

                                      return (
                                        <div className="rounded-2xl border border-border/15 bg-gradient-to-br from-card/80 to-accent/[0.02] backdrop-blur-md p-5 space-y-4.5 shadow-sm animate-fade-in h-full flex flex-col justify-between">
                                          <div className="space-y-4">
                                            {/* Topic Name & Sentiment */}
                                            <div className="flex items-start justify-between gap-3">
                                              <div>
                                                <h4 className="text-sm font-bold text-foreground leading-snug">
                                                  {selectedTopic.name}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-2">
                                                  <span className="text-[10px] text-muted-foreground font-medium">Sentiment:</span>
                                                  <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                                    selectedTopic.sentiment.toLowerCase().includes("frustrated") || selectedTopic.sentiment.toLowerCase().includes("skeptical")
                                                      ? "bg-destructive/10 text-destructive border-destructive/20"
                                                      : selectedTopic.sentiment.toLowerCase().includes("curious") || selectedTopic.sentiment.toLowerCase().includes("inquisitive")
                                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                  }`}>
                                                    {selectedTopic.sentiment}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Mindset / Discussion */}
                                            <div className="space-y-1.5">
                                              <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground flex items-center gap-1">
                                                <Brain className="h-3 w-3 text-accent animate-pulse" />
                                                What's in their minds
                                              </span>
                                              <p className="text-xs text-foreground/90 leading-relaxed font-normal">
                                                {selectedTopic.description}
                                              </p>
                                            </div>

                                            {/* Intent & Motive */}
                                            <div className="space-y-1.5">
                                              <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground flex items-center gap-1">
                                                <Compass className="h-3 w-3 text-accent animate-pulse" />
                                                Core Intent & Motive
                                              </span>
                                              <div className="text-xs text-foreground/80 leading-relaxed bg-accent/5 border border-accent/15 rounded-xl p-3.5 italic">
                                                "{selectedTopic.motiveIntent}"
                                              </div>
                                            </div>
                                          </div>

                                          {/* Classified underlying posts list */}
                                          <div className="pt-4 border-t border-border/15 space-y-2 mt-4">
                                            <span className="text-[9px] uppercase font-black tracking-wider text-muted-foreground block">
                                              Associated Posts ({matchedPosts.length})
                                            </span>
                                            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                              {matchedPosts.map((post, pIdx) => (
                                                <div key={post.reddit_id || pIdx} className="p-2.5 rounded-lg border border-border/15 bg-background/50 hover:border-accent/25 transition-all duration-150 flex items-start justify-between gap-3 text-xs">
                                                  <div className="min-w-0 space-y-1">
                                                    <p className="font-bold text-foreground truncate text-xs">{post.title}</p>
                                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                                                      <span className="text-orange-500 font-bold">r/{post.subreddit}</span>
                                                      <span>{post.score}↑</span>
                                                      <span>{post.comment_count} comments</span>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                                    {post.permalink && (
                                                      <a href={post.permalink.startsWith("http") ? post.permalink : `https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-secondary/40 transition-colors">
                                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                                      </a>
                                                    )}
                                                    <Button size="sm" variant={savedIds.has(post.reddit_id) ? "secondary" : "outline"} className="h-6 text-[9px] font-bold px-2 rounded" onClick={(e) => { e.stopPropagation(); handleSaveToLibrary(post, run.id) }} disabled={savedIds.has(post.reddit_id)}>
                                                      {savedIds.has(post.reddit_id) ? "Saved" : "Save"}
                                                    </Button>
                                                  </div>
                                                </div>
                                              ))}
                                              {matchedPosts.length === 0 && (
                                                <p className="text-[10px] text-muted-foreground italic text-center py-2">
                                                  No matching posts in this topic
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </div>
                              )}

                              {/* Actionable Audience Takeaways */}
                              {insights[run.id].generalTakeaways && insights[run.id].generalTakeaways.length > 0 && (
                                <div className="mt-4 border-t border-border/15 pt-4 animate-slide-up">
                                  <h4 className="text-[9px] uppercase font-black tracking-wider text-muted-foreground/80 mb-3 flex items-center gap-1.5">
                                    <Lightbulb className="h-3.5 w-3.5 text-yellow-500 animate-pulse shrink-0" />
                                    Key Market & Audience Takeaways
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {insights[run.id].generalTakeaways.map((takeaway, idx) => (
                                      <div key={idx} className="p-3.5 rounded-xl border border-border/15 bg-gradient-to-br from-card/60 to-accent/[0.03] backdrop-blur-md hover:border-accent/25 hover:shadow-sm transition-all duration-300 flex items-start gap-3">
                                        <span className="flex items-center justify-center h-5 w-5 rounded-full bg-accent/10 text-accent text-[10px] font-bold shrink-0">
                                          {idx + 1}
                                        </span>
                                        <p className="text-xs text-foreground/85 leading-relaxed font-medium">{takeaway}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Input — floating at bottom */}
      <div className="sticky bottom-4 pt-2 bg-transparent z-40">
        <div className="rounded-2xl border border-border/20 bg-card/85 backdrop-blur-lg shadow-xl overflow-hidden hover:border-border/30 transition-all duration-300 animate-slide-up">
          <textarea
            placeholder="Scrape top 20 posts about SaaS from r/startups... (Enter to run)"
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={2}
            className="w-full resize-none text-xs min-h-[56px] max-h-[160px] border-0 outline-none bg-transparent px-4 pt-3.5 pb-1 placeholder:text-muted-foreground/60 leading-relaxed"
          />
          <div className="flex items-center justify-between px-3.5 pb-3.5 pt-1.5 border-t border-border/5">
            <Select value={provider} onValueChange={v => setProvider(v as ScrapingProvider)}>
              <SelectTrigger className="h-7 w-auto min-w-[110px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                <Terminal className="h-3 w-3 text-accent" />
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reddit_api" className="text-xs">Reddit API</SelectItem>
                <SelectItem value="puppeteer" className="text-xs">Local Puppeteer</SelectItem>
                <SelectItem value="apify" className="text-xs">Apify</SelectItem>
                <SelectItem value="firecrawl" className="text-xs">Firecrawl</SelectItem>
                <SelectItem value="tavily" className="text-xs">Tavily</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={handleSubmit} 
              disabled={loading || !command.trim()} 
              size="icon" 
              className="h-8 w-8 rounded-xl bg-accent hover:bg-accent/90 shadow-md shadow-accent/10 transition-all duration-300 hover:scale-[1.05] shrink-0"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {error && (
          <div className="mt-3 p-3.5 rounded-2xl border border-destructive/20 bg-destructive/5 animate-slide-up text-left">
            <div className="flex items-center gap-2 mb-2 text-destructive font-bold text-[10px] uppercase tracking-wider">
              <Terminal className="h-4 w-4" />
              <span>Command Scraper Debugger Logs</span>
            </div>
            <p className="text-xs text-foreground/90 font-mono bg-black/40 p-2.5 rounded-lg border border-border/40 whitespace-pre-wrap">
              {error}
            </p>
            <div className="flex items-center gap-2 mt-2.5 text-[10px] text-muted-foreground font-medium">
              <span>Attempted Provider: <strong className="text-foreground uppercase">{provider}</strong></span>
              <span>•</span>
              <span>Recommendation: <span className="text-accent font-medium">{(error.includes("403") || error.includes("blocked") || error.includes("Cloudflare")) ? "Switch your provider dropdown above to 'Apify' or 'Tavily' (which leverage residential proxy bypasses)." : "Check your local chromium setup, internet connection, or API keys."}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
