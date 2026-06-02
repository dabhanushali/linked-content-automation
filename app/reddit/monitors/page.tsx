"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  Plus,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Send,
  Sparkles,
  MoreVertical,
  Pencil,
} from "lucide-react"
import { RedditMonitor } from "@/lib/reddit/types"

interface MonitorWithPosts extends RedditMonitor {
  reddit_monitor_posts?: { count: number }[]
  sort?: string
  time_filter?: string
}

interface MonitorPost {
  id?: string
  title?: string
  author?: string
  score?: number
  body?: string
  url?: string
  discovered_at?: string
}

const subredditColors: Record<string, string> = {
  marketing: "bg-blue-500",
  SaaS: "bg-purple-500",
  startups: "bg-green-500",
  sales: "bg-orange-500",
  entrepreneur: "bg-red-500",
  smallbusiness: "bg-yellow-500",
  SEO: "bg-teal-500",
  socialmedia: "bg-pink-500",
}

function getSubredditColor(subreddit: string): string {
  if (subredditColors[subreddit]) return subredditColors[subreddit]
  const colors = [
    "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
    "bg-red-500", "bg-yellow-500", "bg-teal-500", "bg-pink-500",
    "bg-indigo-500", "bg-cyan-500",
  ]
  const hash = subreddit.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

function MonitorsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-2xl bg-card/50 border border-border/10">
            <CardContent className="p-5">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                  <div className="h-5 w-28 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-4 w-36 bg-muted rounded animate-pulse" />
                <div className="h-6 w-16 bg-muted rounded-full animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function FeedMonitorsPage() {
  const [monitors, setMonitors] = useState<MonitorWithPosts[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commandInput, setCommandInput] = useState("")
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null)
  const [detailPosts, setDetailPosts] = useState<MonitorPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [showForm, setShowForm] = useState(true)

  // Create Monitor form state
  const [newDescription, setNewDescription] = useState("")
  const [newSubreddit, setNewSubreddit] = useState("")
  const [newKeyword, setNewKeyword] = useState("")
  const [newInterval, setNewInterval] = useState("60")
  const [newService, setNewService] = useState("reddit_api")
  const [newSort, setNewSort] = useState("relevance")
  const [newTimeFilter, setNewTimeFilter] = useState("all")
  const [editingMonitorId, setEditingMonitorId] = useState<string | null>(null)

  useEffect(() => {
    fetchMonitors()
  }, [])

  // Auto-poll: check due monitors every 30 seconds while page is open
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/reddit/monitors")
      if (!res.ok) return
      const updatedMonitors: MonitorWithPosts[] = await res.json()
      setMonitors(updatedMonitors)

      const now = Date.now()
      for (const monitor of updatedMonitors) {
        if (!monitor.is_active) continue
        const lastChecked = monitor.last_checked_at
          ? new Date(monitor.last_checked_at).getTime()
          : 0
        const intervalMs = (monitor.check_interval_minutes || 60) * 60 * 1000
        const isDue = now - lastChecked >= intervalMs

        if (isDue) {
          fetch(`/api/reddit/monitors/${monitor.id}/check`, { method: "POST" })
            .then(() => fetchMonitors())
            .catch(() => {})
        }
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  async function fetchMonitors() {
    try {
      const res = await fetch("/api/reddit/monitors")
      if (res.ok) {
        setMonitors(await res.json())
      }
    } catch {
      setError("Failed to load monitors")
    } finally {
      setLoading(false)
    }
  }

  async function fetchDetailPosts(id: string) {
    setLoadingPosts(true)
    try {
      const res = await fetch(`/api/reddit/monitors/${id}/posts`)
      if (res.ok) {
        setDetailPosts(await res.json())
      }
    } catch {
      setDetailPosts([])
    } finally {
      setLoadingPosts(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()

    if (!newSubreddit.trim()) {
      setError("Subreddit is required")
      return
    }
    if (!newKeyword.trim()) {
      setError("Keyword is required")
      return
    }

    setCreating(true)
    setError(null)

    try {
      let res: Response

      if (editingMonitorId) {
        // Update existing monitor
        res = await fetch(`/api/reddit/monitors/${editingMonitorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: newKeyword.trim(),
            check_interval_minutes: parseInt(newInterval) || 60,
            service: newService,
          }),
        })
      } else {
        // Create new monitor
        res = await fetch("/api/reddit/monitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subreddit: newSubreddit.trim().replace(/^r\//, ""),
            keyword: newKeyword.trim(),
            check_interval_minutes: parseInt(newInterval) || 60,
            service: newService,
            sort: newSort,
            time_filter: newTimeFilter,
          }),
        })
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to save monitor")
      } else {
        setNewSubreddit("")
        setNewKeyword("")
        setNewDescription("")
        setNewInterval("60")
        setNewService("reddit_api")
        setNewSort("relevance")
        setNewTimeFilter("all")
        setEditingMonitorId(null)
        await fetchMonitors()
      }
    } catch {
      setError("Network error")
    } finally {
      setCreating(false)
    }
  }

  async function handleCheck(id: string) {
    setCheckingId(id)
    setError(null)

    try {
      const res = await fetch(`/api/reddit/monitors/${id}/check`, { method: "POST" })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Check failed")
      } else {
        await fetchMonitors()
        if (selectedMonitorId === id) {
          await fetchDetailPosts(id)
        }
      }
    } catch {
      setError("Check failed")
    } finally {
      setCheckingId(null)
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/reddit/monitors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      })

      if (res.ok) {
        setMonitors((prev) =>
          prev.map((m) => (m.id === id ? { ...m, is_active: !isActive } : m))
        )
      }
    } catch {
      setError("Failed to update monitor")
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/reddit/monitors/${id}`, { method: "DELETE" })
      if (res.ok) {
        setMonitors((prev) => prev.filter((m) => m.id !== id))
        if (selectedMonitorId === id) {
          setSelectedMonitorId(null)
          setDetailPosts([])
        }
      }
    } catch {
      setError("Failed to delete monitor")
    }
  }

  function handleSelectMonitor(id: string) {
    setSelectedMonitorId(id)
    fetchDetailPosts(id)
  }

  function handleBackToList() {
    setSelectedMonitorId(null)
    setDetailPosts([])
  }

  function getPostCount(monitor: MonitorWithPosts): number {
    if (monitor.reddit_monitor_posts && monitor.reddit_monitor_posts.length > 0) {
      return monitor.reddit_monitor_posts[0]?.count || 0
    }
    return 0
  }

  function getNextRun(monitor: MonitorWithPosts): string {
    if (!monitor.is_active) return "Paused"
    if (!monitor.last_checked_at) return "Pending"
    const lastChecked = new Date(monitor.last_checked_at).getTime()
    const intervalMs = (monitor.check_interval_minutes || 60) * 60 * 1000
    const nextRun = new Date(lastChecked + intervalMs)
    const now = Date.now()
    if (nextRun.getTime() <= now) return "Due now"
    const diffMin = Math.round((nextRun.getTime() - now) / 60000)
    if (diffMin < 60) return `${diffMin}m`
    return `${Math.round(diffMin / 60)}h ${diffMin % 60}m`
  }

  function handleCommandSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!commandInput.trim()) return
    setCommandInput("")
  }

  const selectedMonitor = monitors.find((m) => m.id === selectedMonitorId)

  // ─── Detail View ───────────────────────────────────────────────────────────
  if (selectedMonitor) {
    const postCount = getPostCount(selectedMonitor)

    return (
      <div className="flex flex-col h-[calc(100vh-10rem)] animate-fade-in">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-fit mb-4 -ml-2 text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-xl px-3 transition-all duration-300"
          onClick={handleBackToList}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5 text-accent" />
          Back to monitors
        </Button>

        {/* Monitor Header */}
        <div className="rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md p-5 mb-6 animate-slide-up shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className={`h-10 w-10 rounded-full ${getSubredditColor(selectedMonitor.subreddit)} flex items-center justify-center`}>
                <span className="text-sm font-bold text-white">
                  {selectedMonitor.subreddit.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">r/{selectedMonitor.subreddit}</h2>
                  <Badge
                    variant={selectedMonitor.is_active ? "default" : "secondary"}
                    className={selectedMonitor.is_active ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded" : "bg-secondary text-muted-foreground text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded"}
                  >
                    {selectedMonitor.is_active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <p className="text-xs font-semibold text-muted-foreground/80 mt-0.5">&ldquo;{selectedMonitor.keyword}&rdquo;</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-8.5 text-xs font-bold rounded-xl border-border/60 hover:bg-secondary/40"
                onClick={() => handleCheck(selectedMonitor.id)}
                disabled={checkingId === selectedMonitor.id}
              >
                {checkingId === selectedMonitor.id ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-accent" />
                )}
                Run Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8.5 text-xs font-bold rounded-xl border-border/60 hover:bg-secondary/40"
                onClick={() => {
                  setEditingMonitorId(selectedMonitor.id)
                  setNewSubreddit(selectedMonitor.subreddit)
                  setNewKeyword(selectedMonitor.keyword)
                  setNewSort(selectedMonitor.sort || "relevance")
                  setNewTimeFilter(selectedMonitor.time_filter || "all")
                  setNewService(selectedMonitor.service)
                  setNewInterval(String(selectedMonitor.check_interval_minutes))
                  setShowForm(true)
                  handleBackToList()
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8.5 text-xs font-bold rounded-xl border-border/60 hover:bg-secondary/40"
                onClick={() => handleToggle(selectedMonitor.id, selectedMonitor.is_active)}
              >
                {selectedMonitor.is_active ? (
                  <Pause className="h-3.5 w-3.5 mr-1.5 text-accent" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5 text-accent" />
                )}
                {selectedMonitor.is_active ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8.5 text-xs font-bold rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => handleDelete(selectedMonitor.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/10 text-[11px] text-muted-foreground/80 font-bold">
            <span>{postCount} posts discovered</span>
            <span className="h-1 w-1 rounded-full bg-border/40" />
            <span>Next run: {getNextRun(selectedMonitor)}</span>
            <span className="h-1 w-1 rounded-full bg-border/40" />
            <span className="font-mono text-[10px]">{selectedMonitor.service}</span>
            {selectedMonitor.sort && (
              <>
                <span className="h-1 w-1 rounded-full bg-border/40" />
                <span>Sort: {selectedMonitor.sort}</span>
              </>
            )}
            {selectedMonitor.time_filter && (
              <>
                <span className="h-1 w-1 rounded-full bg-border/40" />
                <span>Time: {selectedMonitor.time_filter}</span>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/15 rounded-xl px-3 py-2.5 mb-4 animate-fade-in">
            {error}
          </p>
        )}

        {/* Posts list */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80 mb-2">
            Discovered Posts ({detailPosts.length})
          </h3>

          {loadingPosts ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border/10 p-5 space-y-3 bg-card/50">
                  <div className="h-4.5 w-3/4 bg-muted rounded animate-pulse" />
                  <div className="h-3.5 w-1/2 bg-muted rounded animate-pulse" />
                  <div className="h-12 w-full bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : detailPosts.length === 0 ? (
            <Card className="border-dashed bg-card/25 border-border/80 rounded-2xl">
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground/85 font-semibold">
                  No posts discovered yet. Click &ldquo;Run Now&rdquo; to scan for matching posts.
                </p>
              </CardContent>
            </Card>
          ) : (
            detailPosts.map((post, idx) => (
              <div
                key={post.id || idx}
                className="rounded-2xl border border-border/10 p-4.5 bg-card/45 backdrop-blur-sm hover:border-accent/30 hover:shadow-sm transition-all duration-300 animate-slide-up"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-bold leading-snug text-foreground">{post.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold">
                      {post.author && <span className="text-foreground/75">u/{post.author}</span>}
                      <span className="h-1 w-1 rounded-full bg-border/40" />
                      <span>Score: {post.score || 0}</span>
                    </div>
                    {post.body && (
                      <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2 leading-relaxed font-medium">
                        {post.body}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5 text-xs font-bold">
                    {post.url && (
                      <a
                        href={`/reddit/comments?title=${encodeURIComponent(post.title || "")}&body=${encodeURIComponent(post.body?.slice(0, 500) || "")}&url=${encodeURIComponent(post.url)}`}
                        className="text-accent hover:underline px-2 py-1 rounded hover:bg-accent/5 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Comment
                      </a>
                    )}
                    {post.url && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-secondary/40 transition-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // ─── List View (default) ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-4xl mx-auto relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Feed Monitors</h1>
          <p className="text-xs text-muted-foreground/80 font-medium">
            Watch subreddits for new posts matching your keywords
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/15 rounded-xl px-3 py-2.5 mb-4 animate-fade-in">
          {error}
        </p>
      )}

      {/* Monitor Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
        {monitors.length === 0 ? (
          <Card className="border-dashed bg-card/25 border-border/80 rounded-2xl">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground/85 font-semibold">
                No monitors yet. Use the form below to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pb-4">
            {monitors.map((monitor) => (
              <Card
                key={monitor.id}
                className="overflow-hidden rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md hover:border-accent/35 hover:shadow-md transition-all duration-300 cursor-pointer"
                onClick={() => handleSelectMonitor(monitor.id)}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border/10 px-6 py-4.5 bg-secondary/25">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${getSubredditColor(monitor.subreddit)}`}>
                      <span className="text-xs font-bold">r</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">r/{monitor.subreddit}</span>
                  </div>
                  <button
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/45 transition-colors"
                    onClick={(e) => { e.stopPropagation() }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground/75 mb-1">Keyword</p>
                      <p className="text-sm font-bold text-foreground leading-snug">&ldquo;{monitor.keyword}&rdquo;</p>
                    </div>
                    <Badge
                      className={
                        monitor.is_active
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded shrink-0"
                          : "bg-secondary/50 text-muted-foreground text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded shrink-0"
                      }
                    >
                      {monitor.is_active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border/10 px-6 py-3.5 bg-secondary/15">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold flex-wrap">
                    <span className="font-mono text-accent/80">{monitor.service}</span>
                    <span className="h-1 w-1 rounded-full bg-border/40" />
                    <span>{monitor.sort || "relevance"}</span>
                    <span className="h-1 w-1 rounded-full bg-border/40" />
                    <span>{monitor.time_filter || "all"}</span>
                    <span className="h-1 w-1 rounded-full bg-border/40" />
                    <span className="font-extrabold text-foreground">{getPostCount(monitor)} posts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      className="p-1.5 rounded-lg hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingMonitorId(monitor.id)
                        setNewSubreddit(monitor.subreddit)
                        setNewKeyword(monitor.keyword)
                        setNewSort(monitor.sort || "relevance")
                        setNewTimeFilter(monitor.time_filter || "all")
                        setNewService(monitor.service)
                        setNewInterval(String(monitor.check_interval_minutes))
                        setShowForm(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-secondary/40 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(monitor.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Bar — Create Monitor inline or command input */}
      <div className="sticky bottom-4 pt-2 bg-transparent z-40">
        {showForm ? (
          /* Inline Create Monitor Form — floating capsule styles */
          <form onSubmit={handleCreate}>
            <div className="rounded-2xl border border-border/20 bg-card/85 backdrop-blur-lg shadow-xl overflow-hidden hover:border-border/30 transition-all duration-300 animate-slide-up">
              {/* Two inputs with partition */}
              <div className="flex items-center">
                <input
                  placeholder="r/subreddit"
                  value={newSubreddit}
                  onChange={(e) => setNewSubreddit(e.target.value)}
                  disabled={creating}
                  className="flex-1 h-12 px-4 text-xs bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 leading-relaxed font-bold"
                />
                <div className="w-px h-6 bg-border/20" />
                <input
                  placeholder="Keyword to monitor..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  disabled={creating}
                  className="flex-[2] h-12 px-4 text-xs bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 leading-relaxed font-bold"
                />
              </div>
              <div className="flex items-center justify-between px-3.5 pb-3.5 pt-1.5 border-t border-border/5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Select value={newSort} onValueChange={setNewSort}>
                    <SelectTrigger className="h-7 w-auto min-w-[80px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance" className="text-xs">Relevance</SelectItem>
                      <SelectItem value="hot" className="text-xs">Hot</SelectItem>
                      <SelectItem value="top" className="text-xs">Top</SelectItem>
                      <SelectItem value="new" className="text-xs">New</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={newTimeFilter} onValueChange={setNewTimeFilter}>
                    <SelectTrigger className="h-7 w-auto min-w-[70px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour" className="text-xs">Hour</SelectItem>
                      <SelectItem value="day" className="text-xs">Day</SelectItem>
                      <SelectItem value="week" className="text-xs">Week</SelectItem>
                      <SelectItem value="month" className="text-xs">Month</SelectItem>
                      <SelectItem value="year" className="text-xs">Year</SelectItem>
                      <SelectItem value="all" className="text-xs">All</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={newInterval} onValueChange={setNewInterval}>
                    <SelectTrigger className="h-7 w-auto min-w-[75px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1" className="text-xs">1m</SelectItem>
                      <SelectItem value="5" className="text-xs">5m</SelectItem>
                      <SelectItem value="15" className="text-xs">15m</SelectItem>
                      <SelectItem value="30" className="text-xs">30m</SelectItem>
                      <SelectItem value="60" className="text-xs">1h</SelectItem>
                      <SelectItem value="120" className="text-xs">2h</SelectItem>
                      <SelectItem value="360" className="text-xs">6h</SelectItem>
                      <SelectItem value="1440" className="text-xs">24h</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={newService} onValueChange={setNewService}>
                    <SelectTrigger className="h-7 w-auto min-w-[90px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reddit_api" className="text-xs">Reddit API</SelectItem>
                      <SelectItem value="firecrawl" className="text-xs">Firecrawl</SelectItem>
                      <SelectItem value="tavily" className="text-xs">Tavily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-1.5 ml-2">
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs font-bold rounded-xl hover:bg-secondary/40" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" size="icon" className="h-8 w-8 rounded-xl bg-accent hover:bg-accent/90 shadow-md shadow-accent/10 transition-all duration-300 hover:scale-[1.05] shrink-0" disabled={creating || !newSubreddit.trim() || !newKeyword.trim()}>
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          /* Default command bar */
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Type a command..."
                className="h-11 pr-12 text-xs rounded-2xl bg-card/60 backdrop-blur-md border-border/15 shadow-sm"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCommandSubmit(e) } }}
              />
              <Button
                type="button"
                size="icon"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-xl"
                disabled={!commandInput.trim()}
                onClick={handleCommandSubmit}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-11 rounded-2xl shadow-sm border-border/60 hover:bg-secondary/40 font-bold" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5 text-accent animate-pulse" />
              Create Monitor
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
