"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Sparkles, Check, X, RotateCcw, Copy, Send, User, Palette, Hash, Lightbulb, TrendingUp, MessageSquare, Zap, Library, ExternalLink } from "lucide-react"


interface Subreddit { id: string; name: string; display_name: string }
interface Identity { id: string; name: string; is_default: boolean }
interface Tone { id: string; name: string; description: string }
interface EngagementItem { id: string; title: string; subreddit: string; score: number }
interface GeneratedPost { id: string; title: string; body: string; status: "in_review" | "approved" | "rejected"; version_number: number }

const quickPrompts = [
  { icon: Lightbulb, label: "Share a personal story about...", prompt: "Write a personal story post about overcoming a challenge in " },
  { icon: TrendingUp, label: "Hot take on industry trend", prompt: "Write a contrarian hot take about the latest trend in " },
  { icon: MessageSquare, label: "Ask the community for advice", prompt: "Write a post asking the community for genuine advice about " },
  { icon: Zap, label: "Actionable tips list", prompt: "Write a practical tips post with specific actionable advice about " },
]

export default function RedditGeneratePage() {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([])
  const [identities, setIdentities] = useState<Identity[]>([])
  const [tones, setTones] = useState<Tone[]>([])
  const [engagementItems, setEngagementItems] = useState<EngagementItem[]>([])
  const [selectedSubreddit, setSelectedSubreddit] = useState("")
  const [selectedIdentity, setSelectedIdentity] = useState("")
  const [selectedTone, setSelectedTone] = useState("")
  const [selectedEngagementIds, setSelectedEngagementIds] = useState<string[]>([])
  const [inputMode, setInputMode] = useState<"raw_idea" | "manual_reference" | "scraping_command">("raw_idea")
  const [inputContent, setInputContent] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [showEngagementDialog, setShowEngagementDialog] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/reddit/subreddits").then(r => r.ok ? r.json() : []),
      fetch("/api/reddit/identities").then(r => r.ok ? r.json() : []),
      fetch("/api/reddit/tones").then(r => r.ok ? r.json() : []),
      fetch("/api/reddit/engagement").then(r => r.ok ? r.json() : { items: [] }),
    ]).then(([subs, ids, ts, eng]) => {
      setSubreddits(Array.isArray(subs) ? subs : [])
      setIdentities(Array.isArray(ids) ? ids : [])
      setTones(Array.isArray(ts) ? ts : [])
      setEngagementItems(Array.isArray(eng.items || eng) ? (eng.items || eng) : [])
      const defaultId = (Array.isArray(ids) ? ids : []).find((i: Identity) => i.is_default)
      if (defaultId) setSelectedIdentity(defaultId.id)
    }).catch(() => {})
  }, [])

  async function handleGenerate() {
    if (!selectedSubreddit || !inputContent.trim()) {
      setError("Select a subreddit and describe what you want to write about.")
      return
    }
    setIsGenerating(true); setError(""); setGeneratedPost(null)
    try {
      const res = await fetch("/api/reddit/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subreddit_id: selectedSubreddit, input_mode: inputMode, input_content: inputContent, identity_id: selectedIdentity || undefined, tone_id: selectedTone || undefined, engagement_item_ids: selectedEngagementIds }),
      })
      if (!res.ok) { setError((await res.json()).error || "Generation failed"); return }
      setGeneratedPost(await res.json())
    } catch { setError("Network error.") } finally { setIsGenerating(false) }
  }

  async function handleApprove() {
    if (!generatedPost) return
    try { const res = await fetch(`/api/reddit/generate/${generatedPost.id}/approve`, { method: "POST" }); if (res.ok) setGeneratedPost(await res.json()) } catch { setError("Failed to approve.") }
  }

  async function handleReject() {
    if (!generatedPost) return
    try { const res = await fetch(`/api/reddit/generate/${generatedPost.id}/reject`, { method: "POST" }); if (res.ok) setGeneratedPost(await res.json()) } catch { setError("Failed to reject.") }
  }

  async function handleRegenerate() {
    if (!generatedPost || !feedback.trim()) { setError("Provide feedback."); return }
    setIsGenerating(true); setError("")
    try {
      const res = await fetch(`/api/reddit/generate/${generatedPost.id}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback }) })
      if (!res.ok) { setError((await res.json()).error || "Regeneration failed"); return }
      setGeneratedPost(await res.json()); setFeedback("")
    } catch { setError("Network error.") } finally { setIsGenerating(false) }
  }

  function handleCopy() {
    if (!generatedPost) return
    navigator.clipboard.writeText(`${generatedPost.title}\n\n${generatedPost.body}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function handlePostToReddit() {
    if (!generatedPost) return
    // Copy body to clipboard (user can paste manually if needed)
    navigator.clipboard.writeText(generatedPost.body)
    // Find subreddit name
    const sub = subreddits.find(s => s.id === selectedSubreddit)
    const subredditName = sub?.name || "test"
    // Open new Reddit submit with title and body pre-filled
    // Note: new Reddit uses &text= for body content. User should switch to Markdown Mode for bold to work.
    const url = `https://www.reddit.com/r/${subredditName}/submit?type=TEXT&title=${encodeURIComponent(generatedPost.title)}&text=${encodeURIComponent(generatedPost.body)}`
    window.open(url, "_blank")
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate() }
  }

  function handleQuickPrompt(prompt: string) {
    setInputContent(prompt)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-3xl mx-auto">
      {/* Output Area — scrollable, takes all available space above input */}
      <div className="flex-1 overflow-y-auto pb-4">
        {/* Empty state / greeting */}
        {!generatedPost && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">What do you want to post?</h1>
              <p className="text-sm text-muted-foreground mt-2">Choose a subreddit, describe your idea, and let AI craft an authentic post</p>
            </div>

            {/* Quick prompt cards */}
            <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-lg">
              {quickPrompts.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickPrompt(qp.prompt)}
                  className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 hover:border-accent/30 transition-all duration-150 text-left group"
                >
                  <qp.icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors mt-0.5 shrink-0" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isGenerating && !generatedPost && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
            <p className="text-sm text-muted-foreground">Crafting your post...</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Applying subreddit rules, identity, and anti-AI filters</p>
          </div>
        )}

        {/* Generated output */}
        {generatedPost && (
          <div className="space-y-4 animate-slide-up pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">Generated Post</span>
                <Badge variant={generatedPost.status === "approved" ? "default" : generatedPost.status === "rejected" ? "destructive" : "secondary"} className="text-[10px] capitalize">
                  {generatedPost.status.replace("_", " ")}
                </Badge>
                {generatedPost.version_number > 1 && <Badge variant="outline" className="text-[10px]">v{generatedPost.version_number}</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handlePostToReddit}>
                  <ExternalLink className="h-3 w-3 mr-1" />Post to Reddit
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="p-6 space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Title</p>
                  <h3 className="text-lg font-semibold leading-snug">{generatedPost.title}</h3>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Body</p>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: generatedPost.body.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/^### (.*$)/gm, '<h3 class="font-semibold text-base mt-3 mb-1">$1</h3>').replace(/^## (.*$)/gm, '<h2 class="font-semibold text-lg mt-4 mb-1">$1</h2>').replace(/^# (.*$)/gm, '<h1 class="font-bold text-xl mt-4 mb-2">$1</h1>').replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>').replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>') }} />
                </div>
              </CardContent>
            </Card>

            {generatedPost.status === "in_review" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button onClick={handleApprove} size="sm" className="h-9 flex-1">
                    <Check className="mr-1.5 h-3.5 w-3.5" />Approve
                  </Button>
                  <Button onClick={handleReject} size="sm" variant="destructive" className="h-9 flex-1">
                    <X className="mr-1.5 h-3.5 w-3.5" />Reject
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Textarea placeholder="Feedback for regeneration..." value={feedback} onChange={e => setFeedback(e.target.value)} rows={1} className="resize-none text-sm h-9 min-h-9 py-2 rounded-lg" />
                  <Button onClick={handleRegenerate} size="sm" variant="outline" disabled={isGenerating || !feedback.trim()} className="h-9 shrink-0 rounded-lg">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Redo
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area — fixed at bottom */}
      <div className="sticky bottom-0 pt-4 border-t border-border bg-background">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Textarea
            placeholder={inputMode === "raw_idea" ? "Describe your post topic or idea... (Enter to generate)" : inputMode === "manual_reference" ? "Paste reference text (AI analyzes style only)..." : "Paste scraped content as reference..."}
            value={inputContent}
            onChange={e => setInputContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none text-sm min-h-[56px] max-h-[200px] border-0 focus-visible:ring-0 bg-transparent px-4 pt-3 pb-1"
          />
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Select value={selectedSubreddit} onValueChange={setSelectedSubreddit}>
                <SelectTrigger className="h-7 w-auto min-w-[110px] text-[11px] border-border/60 bg-secondary/50 gap-1 rounded-md">
                  <Hash className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Subreddit" />
                </SelectTrigger>
                <SelectContent>{subreddits.map(s => <SelectItem key={s.id} value={s.id}>r/{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedIdentity} onValueChange={setSelectedIdentity}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-[11px] border-border/60 bg-secondary/50 gap-1 rounded-md">
                  <User className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Persona" />
                </SelectTrigger>
                <SelectContent>{identities.map(i => <SelectItem key={i.id} value={i.id}>{i.name}{i.is_default ? " ★" : ""}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedTone} onValueChange={setSelectedTone}>
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-[11px] border-border/60 bg-secondary/50 gap-1 rounded-md">
                  <Palette className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Tone" />
                </SelectTrigger>
                <SelectContent>{tones.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              {engagementItems.length > 0 && (
                <button
                  onClick={() => setShowEngagementDialog(true)}
                  className="flex items-center gap-1 h-7 px-2.5 text-[11px] font-medium rounded-md border border-border/60 bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Library className="h-3 w-3 text-accent" />
                  {selectedEngagementIds.length > 0 ? `${selectedEngagementIds.length} refs` : "Refs"}
                </button>
              )}
              <div className="flex items-center rounded-md border border-border/60 bg-secondary/50 h-7 overflow-hidden">
                {(["raw_idea", "manual_reference", "scraping_command"] as const).map(mode => (
                  <button key={mode} onClick={() => setInputMode(mode)} className={`px-2 h-full text-[10px] font-medium transition-all duration-150 ${inputMode === mode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {mode === "raw_idea" ? "Idea" : mode === "manual_reference" ? "Ref" : "Scrape"}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating} size="icon" className="h-9 w-9 rounded-lg shrink-0">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mt-2">{error}</p>}
      </div>

      {/* Engagement Library Dialog */}
      {showEngagementDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEngagementDialog(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[70vh] overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Select Style References</h3>
              <button onClick={() => setShowEngagementDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[50vh] p-4 space-y-2">
              {engagementItems.map(item => (
                <label key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-accent/30 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedEngagementIds.includes(item.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedEngagementIds(prev => [...prev, item.id])
                      else setSelectedEngagementIds(prev => prev.filter(id => id !== item.id))
                    }}
                    className="mt-0.5 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.subreddit ? `r/${item.subreddit}` : ""} · Score: {item.score}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end">
              <button onClick={() => setShowEngagementDialog(false)} className="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg">
                Done ({selectedEngagementIds.length} selected)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
