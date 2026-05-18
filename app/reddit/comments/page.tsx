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
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-3xl mx-auto">
      {/* Output Area */}
      <div className="flex-1 overflow-y-auto pb-4">
        {/* Empty state */}
        {!generatedComment && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-5">
              <MessageSquare className="h-6 w-6 text-accent" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Generate a Comment</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Paste a Reddit post URL or provide the post details, then generate a contextual comment.
            </p>
          </div>
        )}

        {/* Loading */}
        {isGenerating && (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
            <p className="text-sm text-muted-foreground">Generating comment...</p>
          </div>
        )}

        {/* Generated comment */}
        {generatedComment && !isGenerating && (
          <div className="space-y-4 animate-slide-up pt-4">
            {/* Reference post */}
            {postTitle && (
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Replying to</p>
                <p className="text-sm font-medium">{postTitle}</p>
                {postUrl && (
                  <a href={postUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline mt-1 inline-block">
                    {postUrl.slice(0, 60)}...
                  </a>
                )}
              </div>
            )}

            {/* Comment output */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">Generated Comment</span>
                <Badge variant="outline" className="text-[10px]">{size}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handlePostComment}>
                  <ExternalLink className="h-3 w-3 mr-1" />Copy & Open
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-5">
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{generatedComment}</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Input Area — fixed at bottom */}
      <div className="sticky bottom-0 pt-4 border-t border-border bg-background">
        {/* Show which post we're commenting on */}
        {(postTitle || postUrl) && (
          <div className="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2 mb-3 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Commenting on</p>
              <p className="text-sm font-medium truncate">{postTitle || "Reddit Post"}</p>
              {postUrl && <p className="text-xs text-muted-foreground truncate">{postUrl}</p>}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="shrink-0 text-muted-foreground hover:text-destructive"
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
            className="h-9 text-sm flex-1"
          />
          <Input
            placeholder="Post title..."
            value={postTitle}
            onChange={e => setPostTitle(e.target.value)}
            className="h-9 text-sm flex-1"
          />
        </div>

        {/* Main input */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Textarea
            placeholder="Describe what kind of comment you want (optional — leave empty for auto)..."
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none text-sm min-h-[56px] max-h-[150px] border-0 focus-visible:ring-0 bg-transparent px-4 pt-3 pb-1"
          />
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Size */}
              <div className="flex items-center rounded-md border border-border/60 bg-secondary/50 h-7 overflow-hidden">
                {(["short", "medium", "long"] as const).map(s => (
                  <button key={s} onClick={() => setSize(s)} className={`px-2.5 h-full text-[10px] font-medium transition-all duration-150 ${size === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Identity */}
              <Select value={selectedIdentity} onValueChange={setSelectedIdentity}>
                <SelectTrigger className="h-7 w-auto min-w-[90px] text-[11px] border-border/60 bg-secondary/50 gap-1 rounded-md">
                  <User className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Persona" />
                </SelectTrigger>
                <SelectContent>{identities.map(i => <SelectItem key={i.id} value={i.id}>{i.name}{i.is_default ? " ★" : ""}</SelectItem>)}</SelectContent>
              </Select>

              {/* Tone */}
              <Select value={selectedTone} onValueChange={setSelectedTone}>
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-[11px] border-border/60 bg-secondary/50 gap-1 rounded-md">
                  <Palette className="h-3 w-3 text-accent" />
                  <SelectValue placeholder="Tone" />
                </SelectTrigger>
                <SelectContent>{tones.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>

              {/* Archetype */}
              <Select value={archetype} onValueChange={setArchetype}>
                <SelectTrigger className="h-7 w-auto min-w-[80px] text-[11px] border-border/60 bg-secondary/50 gap-1 rounded-md">
                  <SelectValue placeholder="Style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="detailed_helper">Helper</SelectItem>
                  <SelectItem value="tool_roundup">Tool Roundup</SelectItem>
                  <SelectItem value="storyteller">Storyteller</SelectItem>
                  <SelectItem value="myth_buster">Myth Buster</SelectItem>
                  <SelectItem value="mini_guide">Mini Guide</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleGenerate} disabled={isGenerating} size="icon" className="h-9 w-9 rounded-lg shrink-0">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mt-2">{error}</p>}
      </div>
    </div>
  )
}
