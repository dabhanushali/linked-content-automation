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
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-3xl mx-auto relative">
      {/* Output Area — scrollable, takes all available space above input */}
      <div className="flex-1 overflow-y-auto pb-4 pr-1 scrollbar-thin">
        {/* Empty state / greeting */}
        {!generatedPost && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in py-12">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                What do you want to post?
              </h1>
              <p className="text-xs text-muted-foreground/80 mt-1.5 font-medium max-w-md mx-auto">
                Choose a subreddit, describe your idea, and let AI craft an authentic post matching subreddit guidelines.
              </p>
            </div>

            {/* Quick prompt cards */}
            <div className="grid grid-cols-2 gap-3 mt-8 w-full max-w-lg">
              {quickPrompts.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickPrompt(qp.prompt)}
                  className="flex items-start gap-3.5 p-4 rounded-2xl border border-border/10 bg-card/40 backdrop-blur-md hover:bg-accent/[0.02] hover:border-accent/30 hover:shadow-[0_4px_20px_-10px_rgba(var(--accent),0.1)] transition-all duration-300 text-left group"
                >
                  <qp.icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors mt-0.5 shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                    {qp.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isGenerating && !generatedPost && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in space-y-4 py-16">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse h-12 w-12" />
              <Loader2 className="h-8 w-8 animate-spin text-accent relative z-10" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold tracking-wide text-foreground">Crafting your post...</p>
              <p className="text-[11px] text-muted-foreground/70">Applying subreddit rules, identity, and anti-AI filters</p>
            </div>
          </div>
        )}

        {/* Generated output */}
        {generatedPost && (
          <div className="space-y-4 animate-slide-up pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">Generated Post</span>
                <Badge 
                  variant={generatedPost.status === "approved" ? "default" : generatedPost.status === "rejected" ? "destructive" : "secondary"} 
                  className="text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded"
                >
                  {generatedPost.status.replace("_", " ")}
                </Badge>
                {generatedPost.version_number > 1 && (
                  <Badge variant="outline" className="text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded">
                    v{generatedPost.version_number}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold rounded-lg border-border/60 hover:bg-secondary/40" onClick={handlePostToReddit}>
                  <ExternalLink className="h-3 w-3 mr-1 text-accent" />Post to Reddit
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-secondary/45" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden bg-card/60 backdrop-blur-md border border-border/15 shadow-sm rounded-2xl transition-all duration-300">
              <CardContent className="p-6 space-y-5">
                <div>
                  <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/80 mb-2">Title</p>
                  <h3 className="text-base font-bold leading-snug text-foreground">{generatedPost.title}</h3>
                </div>
                <div className="border-t border-border/15 pt-5">
                  <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/80 mb-3">Body</p>
                  <div className="text-xs text-foreground/90 leading-relaxed font-normal whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: generatedPost.body.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/^### (.*$)/gm, '<h3 class="font-semibold text-sm mt-3 mb-1">$1</h3>').replace(/^## (.*$)/gm, '<h2 class="font-semibold text-base mt-4 mb-1">$1</h2>').replace(/^# (.*$)/gm, '<h1 class="font-bold text-lg mt-4 mb-2">$1</h1>').replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>').replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>') }} />
                </div>
              </CardContent>
            </Card>

            {generatedPost.status === "in_review" && (
              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <Button onClick={handleApprove} size="sm" className="h-9 flex-1 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-bold shadow-md shadow-accent/5 transition-all duration-300">
                    <Check className="mr-1.5 h-4 w-4" />Approve
                  </Button>
                  <Button onClick={handleReject} size="sm" variant="destructive" className="h-9 flex-1 rounded-xl font-bold transition-all duration-300">
                    <X className="mr-1.5 h-4 w-4" />Reject
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Textarea 
                    placeholder="Provide feedback for intelligent regeneration..." 
                    value={feedback} 
                    onChange={e => setFeedback(e.target.value)} 
                    rows={1} 
                    className="resize-none text-xs h-9 min-h-9 py-2.5 rounded-xl bg-background/50 border border-border/15" 
                  />
                  <Button onClick={handleRegenerate} size="sm" variant="outline" disabled={isGenerating || !feedback.trim()} className="h-9 shrink-0 rounded-xl px-4 border-border/60 hover:bg-secondary/40 font-bold transition-all duration-300">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5 text-accent" />Redo
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area — floating at bottom */}
      <div className="sticky bottom-4 pt-2 bg-transparent z-40">
        <div className="rounded-2xl border border-border/20 bg-card/85 backdrop-blur-lg shadow-xl overflow-hidden hover:border-border/30 transition-all duration-300">
          <Textarea
            placeholder={inputMode === "raw_idea" ? "Describe your post topic or idea... (Enter to generate)" : inputMode === "manual_reference" ? "Paste reference text (AI analyzes style only)..." : "Paste scraped content as reference..."}
            value={inputContent}
            onChange={e => setInputContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none text-xs min-h-[56px] max-h-[160px] border-0 focus-visible:ring-0 bg-transparent px-4 pt-3.5 pb-1 placeholder:text-muted-foreground/60 leading-relaxed"
          />
          <div className="flex items-center justify-between px-3.5 pb-3.5 pt-1.5 border-t border-border/5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Select value={selectedSubreddit} onValueChange={setSelectedSubreddit}>
                <SelectTrigger className="h-7 w-auto min-w-[110px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                  <Hash className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Subreddit" />
                </SelectTrigger>
                <SelectContent>{subreddits.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">r/{s.name}</SelectItem>)}</SelectContent>
              </Select>
              
              <Select value={selectedIdentity} onValueChange={setSelectedIdentity}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                  <User className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Persona" />
                </SelectTrigger>
                <SelectContent>{identities.map(i => <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}{i.is_default ? " ★" : ""}</SelectItem>)}</SelectContent>
              </Select>
              
              <Select value={selectedTone} onValueChange={setSelectedTone}>
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                  <Palette className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Tone" />
                </SelectTrigger>
                <SelectContent>{tones.map(t => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>)}</SelectContent>
              </Select>
              
              {engagementItems.length > 0 && (
                <button
                  onClick={() => setShowEngagementDialog(true)}
                  className="flex items-center gap-1.5 h-7 px-3 text-[10px] font-bold rounded-lg border border-border/10 bg-secondary/35 text-muted-foreground hover:text-foreground hover:bg-secondary/60 hover:border-accent/15 transition-all duration-200"
                >
                  <Library className="h-3 w-3 text-accent" />
                  <span>{selectedEngagementIds.length > 0 ? `${selectedEngagementIds.length} refs` : "Refs"}</span>
                </button>
              )}
              
              <div className="flex items-center rounded-lg border border-border/10 bg-secondary/35 h-7 overflow-hidden p-0.5">
                {(["raw_idea", "manual_reference", "scraping_command"] as const).map(mode => (
                  <button 
                    key={mode} 
                    onClick={() => setInputMode(mode)} 
                    className={`px-2.5 h-full text-[9px] font-bold rounded-md transition-all duration-300 ${
                      inputMode === mode 
                        ? "bg-accent/15 text-accent border border-accent/10 shadow-sm" 
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                    }`}
                  >
                    {mode === "raw_idea" ? "Idea" : mode === "manual_reference" ? "Ref" : "Scrape"}
                  </button>
                ))}
              </div>
            </div>
            
            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || !inputContent.trim() || !selectedSubreddit} 
              size="icon" 
              className="h-8 w-8 rounded-xl bg-accent hover:bg-accent/90 shadow-md shadow-accent/10 transition-all duration-300 hover:scale-[1.05] shrink-0"
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/15 rounded-xl px-3 py-2.5 mt-2 animate-fade-in">{error}</p>}
      </div>

      {/* Engagement Library Dialog */}
      {showEngagementDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowEngagementDialog(false)}>
          <Card 
            className="w-full max-w-md max-h-[70vh] flex flex-col rounded-2xl border border-border/80 shadow-2xl overflow-hidden bg-card/95 backdrop-blur-md animate-in fade-in zoom-in duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 bg-secondary/35">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-accent" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Select Style References</h3>
              </div>
              <button onClick={() => setShowEngagementDialog(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/30 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto max-h-[45vh] p-4 space-y-2.5">
              {engagementItems.map(item => {
                const isChecked = selectedEngagementIds.includes(item.id)
                return (
                  <label 
                    key={item.id} 
                    className={`flex items-start gap-3.5 p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isChecked 
                        ? "bg-accent/10 border-accent/40 shadow-sm" 
                        : "bg-background/45 border-border/60 hover:bg-secondary/20 hover:border-accent/15"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        if (e.target.checked) setSelectedEngagementIds(prev => [...prev, item.id])
                        else setSelectedEngagementIds(prev => prev.filter(id => id !== item.id))
                      }}
                      className="mt-0.5 rounded accent-accent h-3.5 w-3.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                        {item.subreddit ? `r/${item.subreddit}` : ""} · Score: {item.score}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
            
            <div className="px-5 py-3.5 border-t border-border/80 bg-secondary/25 flex justify-end">
              <button 
                onClick={() => setShowEngagementDialog(false)} 
                className="px-4 py-2 text-xs font-bold bg-accent text-accent-foreground rounded-xl shadow-md shadow-accent/5 hover:bg-accent/90 transition-all duration-300"
              >
                Done ({selectedEngagementIds.length} selected)
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
