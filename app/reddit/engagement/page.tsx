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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                <div className="h-12 w-full bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold">Engagement Library</h1>
        <p className="text-sm text-muted-foreground">Your swipe file — saved Reddit posts for style inspiration and context</p>
      </div>

      {/* Filters */}
      <Card className="animate-slide-up">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subreddit</label>
              <Select value={subredditFilter} onValueChange={setSubredditFilter}>
                <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subreddits</SelectItem>
                  {subreddits.map(s => <SelectItem key={s} value={s}>r/{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</label>
              <Input placeholder="Filter by tags..." value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="h-9 w-[200px] text-sm" />
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{items.length} items</span>
          </div>
        </CardContent>
      </Card>

      {/* Items Grid */}
      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">No items in your engagement library yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Save posts from the Command Centre to build your swipe file</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(item => (
            <Card key={item.id} className="hover:border-muted-foreground/40 transition-all duration-150 group animate-slide-up">
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium leading-snug line-clamp-2">{item.title}</h3>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted transition-colors duration-150">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {item.subreddit && <span className="text-orange-500 font-medium">r/{item.subreddit}</span>}
                  {item.author && <span>u/{item.author}</span>}
                  <span className="font-medium">{item.score}↑</span>
                  {item.comment_count > 0 && <span>{item.comment_count} comments</span>}
                </div>

                {/* Body preview */}
                {item.body && <p className="text-xs text-muted-foreground line-clamp-3">{item.body}</p>}

                {/* Tags */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    {item.tags.map(tag => <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>)}
                  </div>
                )}

                {/* Note */}
                {item.note && <p className="text-xs italic text-muted-foreground border-l-2 border-border pl-2">{item.note}</p>}

                {/* Edit mode */}
                {editingId === item.id ? (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Input placeholder="Note..." value={editNote} onChange={e => setEditNote(e.target.value)} className="h-9 text-sm" />
                    <Input placeholder="Tags (comma-separated)" value={editTags} onChange={e => setEditTags(e.target.value)} className="h-9 text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9 text-xs" onClick={() => handleSaveEdit(item.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => { setEditingId(item.id); setEditNote(item.note || ""); setEditTags((item.tags || []).join(", ")) }}>
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
