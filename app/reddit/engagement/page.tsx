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
import { Loader2, Trash2, ExternalLink, Tag } from "lucide-react"
import { EngagementItem } from "@/lib/reddit/types"

export default function EngagementLibraryPage() {
  const [items, setItems] = useState<EngagementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [subredditFilter, setSubredditFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState("")
  const [editTags, setEditTags] = useState("")

  useEffect(() => { fetchItems() }, [subredditFilter, tagFilter])

  async function fetchItems() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (subredditFilter && subredditFilter !== "all") params.set("subreddit", subredditFilter)
      if (tagFilter.trim()) params.set("tags", tagFilter.trim())
      const res = await fetch(`/api/reddit/engagement?${params}`)
      if (res.ok) { const data = await res.json(); setItems(data.items || data || []) }
    } catch {} finally { setLoading(false) }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/reddit/engagement/${id}`, { method: "DELETE" })
      if (res.ok) setItems(prev => prev.filter(i => i.id !== id))
    } catch {}
  }

  async function handleSaveEdit(id: string) {
    try {
      const res = await fetch(`/api/reddit/engagement/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: editNote, tags: editTags.split(",").map(t => t.trim()).filter(Boolean) }) })
      if (res.ok) { await fetchItems(); setEditingId(null) }
    } catch {}
  }

  const subreddits = [...new Set(items.map(i => i.subreddit).filter(Boolean))]

  if (loading && items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-80 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card/50 border border-border/10 rounded-2xl">
              <CardContent className="p-5 space-y-4">
                <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-3.5 w-1/2 bg-muted rounded animate-pulse" />
                <div className="h-14 w-full bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Engagement Library</h1>
        <p className="text-xs text-muted-foreground/80 font-medium">Your swipe file — saved Reddit posts for style inspiration and context</p>
      </div>

      {/* Filters */}
      <Card className="animate-slide-up bg-card/60 backdrop-blur-md border border-border/15 shadow-sm rounded-2xl">
        <CardContent className="py-3.5 px-4.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Subreddit</label>
                <Select value={subredditFilter} onValueChange={setSubredditFilter}>
                  <SelectTrigger className="h-8.5 w-[150px] text-xs bg-background/50 border-border/10 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All subreddits</SelectItem>
                    {subreddits.map(s => <SelectItem key={s} value={s} className="text-xs">r/{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">Tags</label>
                <Input placeholder="Filter by tags..." value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="h-8.5 w-[180px] text-xs bg-background/50 border-border/10 rounded-lg" />
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-bold">{items.length} items</span>
          </div>
        </CardContent>
      </Card>

      {/* Items Grid */}
      {items.length === 0 ? (
        <Card className="border-dashed bg-card/20 border-border/80 rounded-2xl">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground/80 font-semibold">No items in your engagement library yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Save posts from the Command Centre to build your swipe file</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(item => (
            <Card key={item.id} className="bg-card/60 backdrop-blur-md border border-border/15 shadow-sm rounded-2xl hover:border-accent/35 hover:shadow-md transition-all duration-300 group animate-slide-up">
              <CardContent className="p-5 space-y-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-2.5">
                  <h3 className="text-xs font-bold text-foreground leading-snug line-clamp-2">{item.title}</h3>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded-lg hover:bg-secondary/40 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold">
                  {item.subreddit && (
                    <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/15 text-[10px] font-bold py-0.5 px-2.5 rounded-md">
                      r/{item.subreddit}
                    </Badge>
                  )}
                  {item.author && <span className="text-foreground/75 font-semibold">u/{item.author}</span>}
                  <span className="h-1 w-1 rounded-full bg-border/40" />
                  <span className="font-extrabold text-foreground">{item.score}↑</span>
                  {item.comment_count > 0 && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-border/40" />
                      <span>{item.comment_count} comments</span>
                    </>
                  )}
                </div>

                {/* Body preview */}
                {item.body && <p className="text-xs text-muted-foreground/80 line-clamp-3 leading-relaxed font-medium">{item.body}</p>}

                {/* Tags */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Tag className="h-3 w-3 text-accent" />
                    {item.tags.map(tag => <Badge key={tag} variant="outline" className="text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded">{tag}</Badge>)}
                  </div>
                )}

                {/* Note */}
                {item.note && <p className="text-xs italic text-muted-foreground bg-accent/[0.02] border-l-2 border-accent/40 pl-3 py-1 font-medium">{item.note}</p>}

                {/* Edit mode */}
                {editingId === item.id ? (
                  <div className="space-y-2 pt-3.5 border-t border-border/10">
                    <Input placeholder="Add contextual notes..." value={editNote} onChange={e => setEditNote(e.target.value)} className="h-9 text-xs bg-background/50 border border-border/15 rounded-xl" />
                    <Input placeholder="Tags (comma-separated, e.g. SaaS, marketing)" value={editTags} onChange={e => setEditTags(e.target.value)} className="h-9 text-xs bg-background/50 border border-border/15 rounded-xl" />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8.5 text-xs font-bold rounded-xl bg-accent hover:bg-accent/90" onClick={() => handleSaveEdit(item.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-8.5 text-xs font-bold rounded-xl hover:bg-secondary/40" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-8.5 text-xs font-bold text-muted-foreground hover:bg-secondary/30 rounded-xl px-3" onClick={() => { setEditingId(item.id); setEditNote(item.note || ""); setEditTags((item.tags || []).join(", ")) }}>
                    Edit tags & notes
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
