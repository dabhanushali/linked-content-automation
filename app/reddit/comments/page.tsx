"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Send, Copy, Check, ExternalLink, User, Palette, MessageSquare } from "lucide-react"

interface Identity { id: string; name: string; is_default: boolean }
interface Tone { id: string; name: string; description: string }

export default function RedditCommentsPage() {
  const searchParams = useSearchParams()

  // Initialize from sessionStorage or URL params
  const getInitialData = () => {
    // First check URL params
    const urlParam = searchParams.get("url")
    const titleParam = searchParams.get("title")
    const bodyParam = searchParams.get("body")
    
    // Then check sessionStorage (from trend card redirect)
    const stored = sessionStorage.getItem("selectedTrend")
    if (stored) {
      const trend = JSON.parse(stored)
      return {
        url: urlParam || trend.source_url || "",
        title: titleParam || trend.title || "",
        body: bodyParam || trend.summary || ""
      }
    }
    
    return {
      url: urlParam || "",
      title: titleParam || "",
      body: bodyParam || ""
    }
  }

  const initialData = getInitialData()
  const [postUrl, setPostUrl] = useState(initialData.url)
  const [postTitle, setPostTitle] = useState(initialData.title)
  const [postBody, setPostBody] = useState(initialData.body)

  // Config
  const [identities, setIdentities] = useState<Identity[]>([])
  const [tones, setTones] = useState<Tone[]>([])
  const [selectedIdentity, setSelectedIdentity] = useState("")
  const [selectedTone, setSelectedTone] = useState("")
  const [size, setSize] = useState("medium")
  const [archetype, setArchetype] = useState("auto")
  const [instructions, setInstructions] = useState("")

  // Output
  const [generatedComment, setGeneratedComment] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/reddit/identities").then(r => r.ok ? r.json() : []),
      fetch("/api/reddit/tones").then(r => r.ok ? r.json() : []),
    ]).then(([ids, ts]) => {
      setIdentities(Array.isArray(ids) ? ids : [])
      setTones(Array.isArray(ts) ? ts : [])
      const defaultId = (Array.isArray(ids) ? ids : []).find((i: Identity) => i.is_default)
      if (defaultId) setSelectedIdentity(defaultId.id)
    }).catch(() => {})
  }, [])

  async function handleGenerate() {
    if (!postTitle.trim() && !postUrl.trim()) {
      setError("Provide a post title or URL to comment on.")
      return
    }
    setIsGenerating(true); setError(""); setGeneratedComment("")
    try {
      const res = await fetch("/api/comments/reddit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trendTitle: postTitle,
          trendSummary: postBody,
          trendUrl: postUrl,
          identity_id: selectedIdentity || undefined,
          tone_id: selectedTone || undefined,
          commentSize: size,
          archetype,
          instructions: instructions.trim() || undefined,
        }),
      })
      if (!res.ok) { setError((await res.json()).error || "Generation failed"); return }
      const data = await res.json()
      setGeneratedComment(data.comment || data.generated_comment || "")
    } catch { setError("Network error.") } finally { setIsGenerating(false) }
  }

  function handleCopy() {
    navigator.clipboard.writeText(generatedComment)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function handlePostComment() {
    navigator.clipboard.writeText(generatedComment)
    if (postUrl) {
      // Append #autopaste so the userscript can detect and auto-paste
      const separator = postUrl.includes("?") ? "&" : "?"
      const url = postUrl.includes("reddit.com")
        ? postUrl + "#autopaste"
        : postUrl
      window.open(url, "_blank")
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate() }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-3xl mx-auto relative">
      {/* Output Area */}
      <div className="flex-1 overflow-y-auto pb-4 pr-1 scrollbar-thin">
        {/* Empty state */}
        {!generatedComment && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in py-12">
            <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-6">
              <div className="absolute inset-0 rounded-2xl bg-accent/15 blur-md animate-pulse" />
              <MessageSquare className="h-6 w-6 text-accent relative z-10" />
            </div>
            <h2 className="text-xl font-bold mb-2 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Generate a Comment</h2>
            <p className="text-xs text-muted-foreground/80 max-w-md font-medium">
              Paste a Reddit post URL or provide the post details, then generate a contextual comment matching subreddit guidelines.
            </p>
          </div>
        )}

        {/* Loading */}
        {isGenerating && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in space-y-4 py-16">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse h-12 w-12" />
              <Loader2 className="h-8 w-8 animate-spin text-accent relative z-10" />
            </div>
            <p className="text-xs font-semibold tracking-wide text-foreground">Generating comment...</p>
          </div>
        )}

        {/* Generated comment */}
        {generatedComment && !isGenerating && (
          <div className="space-y-4 animate-slide-up pt-4">
            {/* Reference post */}
            {postTitle && (
              <div className="rounded-2xl border border-border/15 bg-secondary/15 p-4.5 shadow-sm">
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/80 mb-1">Replying to</p>
                <p className="text-xs font-bold text-foreground leading-snug">{postTitle}</p>
                {postUrl && (
                  <a href={postUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent hover:underline mt-1.5 inline-block font-semibold">
                    {postUrl.slice(0, 60)}...
                  </a>
                )}
              </div>
            )}

            {/* Comment output */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">Generated Comment</span>
                <Badge variant="outline" className="text-[9px] uppercase font-black tracking-widest py-0.5 px-2 rounded">
                  {size}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-8 text-[10px] font-bold rounded-lg border-border/60 hover:bg-secondary/40" onClick={handlePostComment}>
                  <ExternalLink className="h-3 w-3 mr-1 text-accent" />Copy & Open
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg hover:bg-secondary/45" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden bg-card/60 backdrop-blur-md border border-border/15 shadow-sm rounded-2xl transition-all duration-300">
              <CardContent className="p-6">
                <div className="text-xs text-foreground/90 leading-relaxed font-medium whitespace-pre-wrap">{generatedComment}</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Input Area — floating at bottom */}
      <div className="sticky bottom-4 pt-2 bg-transparent z-40">
        {/* Show which post we're commenting on */}
        {(postTitle || postUrl) && (
          <div className="rounded-xl bg-accent/10 border border-accent/20 px-3.5 py-2 mb-3 flex items-center justify-between animate-fade-in">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/80 mb-0.5">Commenting on</p>
              <p className="text-xs font-bold text-foreground truncate">{postTitle || "Reddit Post"}</p>
              {postUrl && <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5 font-medium">{postUrl}</p>}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="shrink-0 text-muted-foreground hover:text-destructive text-xs font-bold hover:bg-destructive/10 rounded-lg h-7"
              onClick={() => { setPostTitle(""); setPostUrl(""); setPostBody("") }}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Post reference inputs — always show, pre-filled if redirected */}
        <div className="flex items-center gap-2 mb-3">
          <Input
            placeholder="Reddit post URL..."
            value={postUrl}
            onChange={e => setPostUrl(e.target.value)}
            className="h-9 text-xs bg-background/50 border-border/15 rounded-xl focus-visible:ring-1 focus-visible:ring-accent/40 flex-1 font-medium"
          />
          <Input
            placeholder="Post title..."
            value={postTitle}
            onChange={e => setPostTitle(e.target.value)}
            className="h-9 text-xs bg-background/50 border-border/15 rounded-xl focus-visible:ring-1 focus-visible:ring-accent/40 flex-1 font-medium"
          />
        </div>

        {/* Main input */}
        <div className="rounded-2xl border border-border/20 bg-card/85 backdrop-blur-lg shadow-xl overflow-hidden hover:border-border/30 transition-all duration-300 animate-slide-up">
          <Textarea
            placeholder="Describe what kind of comment you want (optional — leave empty for auto)..."
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none text-xs min-h-[56px] max-h-[150px] border-0 focus-visible:ring-0 bg-transparent px-4 pt-3.5 pb-1 placeholder:text-muted-foreground/60 leading-relaxed"
          />
          <div className="flex items-center justify-between px-3.5 pb-3.5 pt-1.5 border-t border-border/5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Size */}
              <div className="flex items-center rounded-lg border border-border/10 bg-secondary/35 h-7 overflow-hidden p-0.5">
                {(["short", "medium", "long"] as const).map(s => (
                  <button 
                    key={s} 
                    onClick={() => setSize(s)} 
                    className={`px-2.5 h-full text-[9px] font-bold rounded-md transition-all duration-300 ${
                      size === s 
                        ? "bg-accent/15 text-accent border border-accent/10 shadow-sm" 
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Identity */}
              <Select value={selectedIdentity} onValueChange={setSelectedIdentity}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                  <User className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Persona" />
                </SelectTrigger>
                <SelectContent>{identities.map(i => <SelectItem key={i.id} value={i.id} className="text-xs">{i.name}{i.is_default ? " ★" : ""}</SelectItem>)}</SelectContent>
              </Select>

              {/* Tone */}
              <Select value={selectedTone} onValueChange={setSelectedTone}>
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                  <Palette className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Tone" />
                </SelectTrigger>
                <SelectContent>{tones.map(t => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>)}</SelectContent>
              </Select>

              {/* Archetype */}
              <Select value={archetype} onValueChange={setArchetype}>
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-[10px] font-bold border-border/10 bg-secondary/35 gap-1 rounded-lg hover:bg-secondary/60 hover:text-foreground transition-all duration-200">
                  <SelectValue placeholder="Style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                  <SelectItem value="detailed_helper" className="text-xs">Helper</SelectItem>
                  <SelectItem value="tool_roundup" className="text-xs">Tool Roundup</SelectItem>
                  <SelectItem value="storyteller" className="text-xs">Storyteller</SelectItem>
                  <SelectItem value="myth_buster" className="text-xs">Myth Buster</SelectItem>
                  <SelectItem value="mini_guide" className="text-xs">Mini Guide</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleGenerate} 
              disabled={isGenerating || (!postTitle.trim() && !postUrl.trim())} 
              size="icon" 
              className="h-8 w-8 rounded-xl bg-accent hover:bg-accent/90 shadow-md shadow-accent/10 transition-all duration-300 hover:scale-[1.05] shrink-0"
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/15 rounded-xl px-3 py-2.5 mt-2 animate-fade-in">{error}</p>}
      </div>
    </div>
  )
}
