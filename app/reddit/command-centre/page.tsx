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
import { Loader2, Send, BookmarkPlus, ExternalLink, Terminal, Search, TrendingUp, Hash, RefreshCw, Trash2, Pencil } from "lucide-react"
import { ScrapingProvider, ScrapedPost, ScrapeRun } from "@/lib/reddit/types"

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
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-4xl mx-auto">
      {/* Results Area — scrollable */}
      <div className="flex-1 overflow-y-auto pb-4">
        {runs.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-5">
              <Terminal className="h-6 w-6 text-accent" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Command Centre</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">Type natural language commands to discover Reddit content</p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
              {quickCommands.map((qc, i) => (
                <button key={i} onClick={() => setCommand(qc.command)} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 hover:border-accent/30 transition-all duration-150 text-left group">
                  <qc.icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors mt-0.5 shrink-0" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{qc.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && runs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
            <p className="text-sm text-muted-foreground">Scraping Reddit...</p>
          </div>
        )}

        {runs.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run History</h2>
              <span className="text-xs text-muted-foreground">{runs.length} runs</span>
            </div>
            {runs.map(run => {
              const isExpanded = expandedRunId === run.id
              const results = isExpanded ? parseResults(run) : []
              return (
                <div key={run.id} className="animate-slide-up">
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card cursor-pointer hover:border-accent/30 transition-all duration-150" onClick={() => setExpandedRunId(isExpanded ? null : run.id)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={run.status === "complete" ? "default" : run.status === "failed" ? "destructive" : "secondary"} className="text-[10px] shrink-0">{run.status}</Badge>
                      <span className="text-sm truncate">{run.command_text}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4 text-xs text-muted-foreground">
                      <span>{run.actor_used || "reddit_api"}</span>
                      <span className="font-medium text-foreground">{run.result_count}</span>
                      <span>{new Date(run.created_at).toLocaleDateString()}</span>
                      <button
                        className="p-1 rounded hover:text-foreground transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleRerun(run.command_text, run.id) }}
                        title="Re-run"
                        disabled={rerunningId === run.id}
                      >
                        <RefreshCw className={`h-3 w-3 ${rerunningId === run.id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        className="p-1 rounded hover:text-foreground transition-colors"
                        onClick={(e) => { e.stopPropagation(); setEditingRunId(run.id); setCommand(run.command_text) }}
                        title="Edit & re-run"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        className="p-1 rounded hover:text-destructive transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleDeleteRun(run.id) }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {isExpanded && results.length > 0 && (
                    <div className="mt-2 space-y-2 pl-2 animate-slide-down">
                      {results.map((post, idx) => (
                        <div key={post.reddit_id || idx} className="flex items-start justify-between gap-3 rounded-xl border border-border p-4 bg-card hover:border-accent/20 transition-all duration-150">
                          <div className="min-w-0 space-y-1.5 flex-1">
                            <p className="text-sm font-medium leading-snug">{post.title}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="text-orange-500 font-medium">r/{post.subreddit}</span>
                              <span>u/{post.author}</span>
                              <span>{post.score}↑</span>
                              <span>{post.comment_count} comments</span>
                            </div>
                            {post.selftext && <p className="text-xs text-muted-foreground line-clamp-2">{post.selftext}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {post.permalink && (
                              <a href={post.permalink.startsWith("http") ? post.permalink : `https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                              </a>
                            )}
                            <Button size="sm" variant={savedIds.has(post.reddit_id) ? "secondary" : "outline"} className="h-7 text-xs px-2 rounded-lg" onClick={(e) => { e.stopPropagation(); handleSaveToLibrary(post, run.id) }} disabled={savedIds.has(post.reddit_id)}>
                              <BookmarkPlus className="h-3 w-3 mr-1" />{savedIds.has(post.reddit_id) ? "Saved" : "Save"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Input — fixed at bottom, same as Generate page */}
      <div className="sticky bottom-0 pt-4 border-t border-border bg-background">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <textarea
            placeholder="Scrape top 20 posts about SaaS from r/startups... (Enter to run)"
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={2}
            className="w-full resize-none text-sm min-h-[56px] max-h-[200px] border-0 outline-none bg-transparent px-4 pt-3 pb-1 placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between px-3 pb-3 pt-0">
            <Select value={provider} onValueChange={v => setProvider(v as ScrapingProvider)}>
              <SelectTrigger className="h-7 w-auto min-w-[110px] text-[11px] border-border/60 bg-secondary/50 gap-1 rounded-md">
                <Terminal className="h-3 w-3 text-accent" />
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reddit_api">Reddit API</SelectItem>
                <SelectItem value="apify">Apify</SelectItem>
                <SelectItem value="firecrawl">Firecrawl</SelectItem>
                <SelectItem value="tavily">Tavily</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSubmit} disabled={loading || !command.trim()} size="icon" className="h-9 w-9 rounded-lg shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mt-2">{error}</p>}
      </div>
    </div>
  )
}
