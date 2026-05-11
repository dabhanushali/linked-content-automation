"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { Loader2, Plus, X, Trash2, FileText, Globe, Save, RefreshCw, Sparkles } from "lucide-react"
import { Settings, KnowledgeItem, PostExample } from "@/lib/settings"

// Moscow is UTC+3
function moscowTimeFromUtc(utcTime: string): string {
  const [h, m] = utcTime.split(":").map(Number)
  const moscowHour = (h + 3) % 24
  return `${String(moscowHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function utcTimeFromMoscow(moscowTime: string): string {
  const [h, m] = moscowTime.split(":").map(Number)
  const utcHour = (h - 3 + 24) % 24
  return `${String(utcHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingKb, setLoadingKb] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const [loadingPrompt, setLoadingPrompt] = useState(false)

  // Topic cluster input
  const [newTopic, setNewTopic] = useState("")
  // Competitor input
  const [newCompetitor, setNewCompetitor] = useState("")
  // News source input
  const [newSource, setNewSource] = useState("")
  // Subreddit input
  const [newSubreddit, setNewSubreddit] = useState("")
  // URL input
  const [newUrl, setNewUrl] = useState("")
  const [newUrlName, setNewUrlName] = useState("")
  const [addingUrl, setAddingUrl] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)

  // Examples state
  const [examples, setExamples] = useState<PostExample[]>([])
  const [loadingExamples, setLoadingExamples] = useState(false)
  const [exampleText, setExampleText] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [savingExample, setSavingExample] = useState(false)
  const [extractedMeta, setExtractedMeta] = useState<{
    hook_text: string; hook_type: string; tone: string; format: string; why_it_works: string; topic_tags: string[]
  } | null>(null)
  const [exampleReactions, setExampleReactions] = useState("")
  const [exampleComments, setExampleComments] = useState("")
  const [exampleReposts, setExampleReposts] = useState("")
  const [exampleViews, setExampleViews] = useState("")
  const [exampleMediaType, setExampleMediaType] = useState<"text_only" | "image" | "video" | "pdf" | "carousel">("text_only")
  const [exampleSourceUrl, setExampleSourceUrl] = useState("")
  const [exampleSource, setExampleSource] = useState<"own" | "curated">("own")

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => toast({ title: "Failed to load settings", variant: "destructive" }))

    fetch("/api/knowledge")
      .then((r) => r.json())
      .then(setKnowledge)
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error()
      toast({ title: "Settings saved" })
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const addTopic = () => {
    if (!newTopic.trim() || !settings) return
    const current = settings.topic_clusters || []
    setSettings({ ...settings, topic_clusters: [...current, newTopic.trim()] })
    setNewTopic("")
  }

  const removeTopic = (index: number) => {
    if (!settings) return
    const current = settings.topic_clusters || []
    setSettings({ ...settings, topic_clusters: current.filter((_, i) => i !== index) })
  }

  const addCompetitor = () => {
    if (!newCompetitor.trim() || !settings) return
    const current = settings.competitors || []
    setSettings({ ...settings, competitors: [...current, newCompetitor.trim()] })
    setNewCompetitor("")
  }

  const removeCompetitor = (index: number) => {
    if (!settings) return
    const current = settings.competitors || []
    setSettings({ ...settings, competitors: current.filter((_, i) => i !== index) })
  }

  const addSource = () => {
    if (!newSource.trim() || !settings) return
    const current = settings.trend_sources || []
    setSettings({ ...settings, trend_sources: [...current, newSource.trim()] })
    setNewSource("")
  }

  const removeSource = (index: number) => {
    if (!settings) return
    const current = settings.trend_sources || []
    setSettings({ ...settings, trend_sources: current.filter((_, i) => i !== index) })
  }

  const addSubreddit = () => {
    if (!newSubreddit.trim() || !settings) return
    const name = newSubreddit.trim().replace(/^r\//, "")
    const current = settings.subreddits || []
    setSettings({ ...settings, subreddits: [...current, name] })
    setNewSubreddit("")
  }

  const removeSubreddit = (index: number) => {
    if (!settings) return
    const current = settings.subreddits || []
    setSettings({ ...settings, subreddits: current.filter((_, i) => i !== index) })
  }

  const handleAddUrl = async () => {
    if (!newUrl.trim()) return
    setAddingUrl(true)
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), name: newUrlName.trim() || newUrl.trim() }),
      })
      if (!res.ok) throw new Error()
      const item = await res.json()
      setKnowledge((prev) => [item, ...prev])
      setNewUrl("")
      setNewUrlName("")
      toast({ title: "URL added to knowledge base" })
    } catch {
      toast({ title: "Failed to fetch URL", variant: "destructive" })
    } finally {
      setAddingUrl(false)
    }
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/knowledge", { method: "POST", body: formData })
      if (!res.ok) throw new Error()
      const item = await res.json()
      setKnowledge((prev) => [item, ...prev])
      toast({ title: `${file.name} added to knowledge base` })
    } catch {
      toast({ title: "Failed to parse PDF", variant: "destructive" })
    } finally {
      setUploadingPdf(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleLoadPrompt = async (rebuild = false) => {
    setLoadingPrompt(true)
    try {
      const res = await fetch("/api/settings/prompt", { method: rebuild ? "POST" : "GET" })
      const data = await res.json()
      setSystemPrompt(data.prompt)
    } catch {
      toast({ title: "Failed to load prompt", variant: "destructive" })
    } finally {
      setLoadingPrompt(false)
    }
  }

  const handleDeleteKb = async (id: string) => {
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" })
    setKnowledge((prev) => prev.filter((item) => item.id !== id))
  }

  const handleLoadExamples = async () => {
    setLoadingExamples(true)
    try {
      const res = await fetch("/api/examples")
      if (res.ok) setExamples(await res.json())
    } finally {
      setLoadingExamples(false)
    }
  }

  const handleExtractMeta = async () => {
    if (!exampleText.trim()) return
    setExtracting(true)
    setExtractedMeta(null)
    try {
      const res = await fetch("/api/examples/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: exampleText.trim() }),
      })
      if (!res.ok) throw new Error("Extraction failed")
      setExtractedMeta(await res.json())
    } catch {
      toast({ title: "Failed to extract metadata", variant: "destructive" })
    } finally {
      setExtracting(false)
    }
  }

  const handleSaveExample = async () => {
    if (!exampleText.trim()) return
    setSavingExample(true)
    try {
      const res = await fetch("/api/examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: exampleText.trim(),
          ...extractedMeta,
          reactions: exampleReactions ? parseInt(exampleReactions) : null,
          comments: exampleComments ? parseInt(exampleComments) : null,
          reposts: exampleReposts ? parseInt(exampleReposts) : null,
          views: exampleViews ? parseInt(exampleViews) : null,
          media_type: exampleMediaType,
          source_url: exampleSourceUrl.trim() || null,
          source: exampleSource,
        }),
      })
      if (!res.ok) throw new Error("Save failed")
      const saved = await res.json()
      setExamples(prev => [saved, ...prev].sort((a, b) => (b.reactions ?? 0) - (a.reactions ?? 0)))
      setExampleText("")
      setExtractedMeta(null)
      setExampleReactions("")
      setExampleComments("")
      setExampleReposts("")
      setExampleViews("")
      setExampleMediaType("text_only")
      setExampleSourceUrl("")
      toast({ title: "Example saved" })
    } catch {
      toast({ title: "Failed to save example", variant: "destructive" })
    } finally {
      setSavingExample(false)
    }
  }

  const handleDeleteExample = async (id: string) => {
    await fetch(`/api/examples/${id}`, { method: "DELETE" })
    setExamples(prev => prev.filter(e => e.id !== id))
  }

  const [reextracting, setReextracting] = useState<string | null>(null)

  const handleReextract = async (ex: PostExample) => {
    setReextracting(ex.id)
    try {
      const res = await fetch("/api/examples/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: ex.content }),
      })
      if (!res.ok) throw new Error()
      const meta = await res.json()
      await fetch(`/api/examples/${ex.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      })
      setExamples(prev => prev.map(e => e.id === ex.id ? { ...e, ...meta } : e))
      toast({ title: "Metadata updated" })
    } catch {
      toast({ title: "Re-extract failed", variant: "destructive" })
    } finally {
      setReextracting(null)
    }
  }

  const handleToggleExample = async (id: string, active: boolean) => {
    await fetch(`/api/examples/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    })
    setExamples(prev => prev.map(e => e.id === id ? { ...e, active } : e))
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure Harvey's brand, topics, and knowledge base
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="brand">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7">
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="examples" onClick={() => { if (!examples.length) handleLoadExamples() }}>Examples</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="prompt" onClick={() => { if (!systemPrompt) handleLoadPrompt() }}>Assembled</TabsTrigger>
        </TabsList>

        {/* Brand Tab */}
        <TabsContent value="brand" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">AI Provider</CardTitle>
              <CardDescription>Which AI to use for trend analysis and post generation.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={settings.ai_provider ?? "anthropic"}
                onValueChange={(v) => setSettings({ ...settings, ai_provider: v as "anthropic" | "openai" })}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="anthropic">Anthropic (Claude)</TabsTrigger>
                  <TabsTrigger value="openai">OpenAI (GPT-4o)</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground mt-2">
                Set the corresponding API key in your <code className="bg-muted px-1 rounded">.env.local</code> file.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Harvey Profile</CardTitle>
              <CardDescription>Who is Harvey? What does it do? This feeds directly into the generation prompt.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.harvey_profile}
                onChange={(e) => setSettings({ ...settings, harvey_profile: e.target.value })}
                rows={4}
                placeholder="Harvey is an AI copilot for B2B sales teams..."
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Ideal Customer Profile (ICP)</CardTitle>
              <CardDescription>Who does Harvey sell to? Used to make posts more targeted.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.icp}
                onChange={(e) => setSettings({ ...settings, icp: e.target.value })}
                rows={3}
                placeholder="B2B SaaS companies, 10-200 employees, sales-led growth..."
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Voice Rules</CardTitle>
              <CardDescription>Specific rules for how Harvey writes. The more specific, the better.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.voice_rules}
                onChange={(e) => setSettings({ ...settings, voice_rules: e.target.value })}
                rows={4}
                placeholder="Direct and confident. No fluff. Use data points. Short sentences..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Topics & Competitors Tab */}
        <TabsContent value="topics" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Topic Clusters</CardTitle>
              <CardDescription>Keywords Claude searches for when fetching trends. Be specific.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(settings.topic_clusters ?? []).map((topic, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1">
                    {topic}
                    <button onClick={() => removeTopic(i)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTopic()}
                  placeholder="e.g. AI SDR 2026"
                />
                <Button variant="outline" size="icon" onClick={addTopic}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Competitors</CardTitle>
              <CardDescription>Used when "Include competitor angle" is checked in post generation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(settings.competitors ?? []).map((comp, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1">
                    {comp}
                    <button onClick={() => removeCompetitor(i)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCompetitor()}
                  placeholder="e.g. Outreach"
                />
                <Button variant="outline" size="icon" onClick={addCompetitor}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Daily Auto-Refresh Schedule</CardTitle>
              <CardDescription>
                Trends refresh automatically once per day. Set the time in Moscow time (UTC+3).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Input
                  type="time"
                  value={moscowTimeFromUtc(settings.trend_refresh_time ?? "06:00")}
                  onChange={(e) => {
                    const utc = utcTimeFromMoscow(e.target.value)
                    setSettings({ ...settings, trend_refresh_time: utc })
                  }}
                  className="w-36"
                />
                <span className="text-sm text-muted-foreground">Moscow time</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Stored as UTC {settings.trend_refresh_time ?? "06:00"} · You can also refresh manually from the dashboard.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* News Sources Tab */}
        <TabsContent value="sources" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Tracked News Sources</CardTitle>
              <CardDescription>
                Website URLs Harvey scrapes when refreshing trends and researching topics. Add sites you follow regularly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(settings.trend_sources ?? []).map((source, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1 max-w-xs">
                    <span className="truncate">{source}</span>
                    <button onClick={() => removeSource(i)} className="ml-1 hover:text-destructive shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(settings.trend_sources ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No sources added yet.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSource()}
                  placeholder="https://techcrunch.com"
                />
                <Button variant="outline" size="icon" onClick={addSource}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                These sites are scraped when refreshing trends and used as context in research reports.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Reddit Subreddits</CardTitle>
              <CardDescription>
                Subreddits scanned for trending discussions. Enter names without the r/ prefix.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(settings.subreddits ?? []).map((sub, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1">
                    <span className="text-orange-400">r/</span>{sub}
                    <button onClick={() => removeSubreddit(i)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(settings.subreddits ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No subreddits configured — defaults will be used: sales, SaaS, B2BMarketing, startups, Entrepreneur, artificial.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newSubreddit}
                  onChange={(e) => setNewSubreddit(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSubreddit()}
                  placeholder="e.g. sales or r/sales"
                />
                <Button variant="outline" size="icon" onClick={addSubreddit}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Upload PDF</CardTitle>
              <CardDescription>Company decks, one-pagers, battle cards. Text is extracted and injected into Claude's context.</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPdf}
              >
                {uploadingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {uploadingPdf ? "Parsing PDF..." : "Choose PDF"}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Add Website</CardTitle>
              <CardDescription>Harvey's website, landing page, or any relevant URL. Content is fetched and stored.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Name</Label>
                <Input
                  value={newUrlName}
                  onChange={(e) => setNewUrlName(e.target.value)}
                  placeholder="e.g. Harvey Homepage"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                    placeholder="https://..."
                  />
                  <Button variant="outline" onClick={handleAddUrl} disabled={addingUrl}>
                    {addingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {knowledge.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">Saved Items ({knowledge.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {knowledge.map((item, i) => (
                  <div key={item.id}>
                    {i > 0 && <Separator className="my-2" />}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {item.type === "pdf" ? (
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleDateString("en-US", {
                              month: "short", day: "numeric",
                            })} · {item.content.length.toLocaleString()} chars extracted
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleDeleteKb(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* System Prompt Tab */}
        <TabsContent value="examples" className="space-y-6 mt-6">
          {/* Add example */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Add Writing Example</CardTitle>
              <CardDescription>Paste a high-performing LinkedIn post. AI will extract metadata automatically. You add the engagement numbers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={exampleText}
                onChange={(e) => { setExampleText(e.target.value); setExtractedMeta(null) }}
                placeholder="Paste a LinkedIn post here..."
                className="resize-none text-sm min-h-[160px] font-mono"
              />
              <Button variant="outline" onClick={handleExtractMeta} disabled={!exampleText.trim() || extracting}>
                {extracting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting...</> : <><Sparkles className="mr-2 h-4 w-4" />Extract metadata</>}
              </Button>

              {extractedMeta && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tone</Label>
                      <p className="text-sm font-medium">{extractedMeta.tone}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hook type</Label>
                      <p className="text-sm font-medium">{extractedMeta.hook_type}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Format</Label>
                      <p className="text-sm font-medium">{extractedMeta.format}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hook</Label>
                    <p className="text-sm text-foreground">{extractedMeta.hook_text}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Why it works</Label>
                    <textarea
                      className="w-full text-sm text-foreground bg-muted rounded-md px-3 py-2 resize-none min-h-[72px] border border-border"
                      value={extractedMeta.why_it_works}
                      onChange={(e) => setExtractedMeta(prev => prev ? { ...prev, why_it_works: e.target.value } : null)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Topic tags</Label>
                    <div className="flex flex-wrap gap-1">
                      {extractedMeta.topic_tags.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Reactions ❤️</Label>
                    <Input type="number" min="0" value={exampleReactions} onChange={(e) => setExampleReactions(e.target.value)} placeholder="e.g. 340" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Comments 💬</Label>
                    <Input type="number" min="0" value={exampleComments} onChange={(e) => setExampleComments(e.target.value)} placeholder="e.g. 48" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Reposts 🔁</Label>
                    <Input type="number" min="0" value={exampleReposts} onChange={(e) => setExampleReposts(e.target.value)} placeholder="e.g. 12" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Views (optional)</Label>
                    <Input type="number" min="0" value={exampleViews} onChange={(e) => setExampleViews(e.target.value)} placeholder="e.g. 12000" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Media type</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(["text_only", "image", "video", "pdf", "carousel"] as const).map(type => (
                      <Button
                        key={type}
                        variant={exampleMediaType === type ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => setExampleMediaType(type)}
                      >
                        {type === "text_only" ? "Text only" : type.charAt(0).toUpperCase() + type.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Original post URL (optional)</Label>
                <Input value={exampleSourceUrl} onChange={(e) => setExampleSourceUrl(e.target.value)} placeholder="https://linkedin.com/posts/..." />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Button
                    variant={exampleSource === "own" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setExampleSource("own")}
                  >My post</Button>
                  <Button
                    variant={exampleSource === "curated" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setExampleSource("curated")}
                  >Curated</Button>
                </div>
                <Button onClick={handleSaveExample} disabled={!exampleText.trim() || savingExample}>
                  {savingExample ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save example
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Examples list */}
          {loadingExamples ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : examples.length === 0 ? (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground mb-3 opacity-30" />
                <p className="text-sm text-muted-foreground">No examples yet. Add your best-performing posts above.</p>
                <p className="text-xs text-muted-foreground mt-1">Aim for 5–15 examples across different tones for best results.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {examples.map((ex) => (
                <Card key={ex.id} className={`bg-card border-border ${!ex.active ? "opacity-50" : ""}`}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-medium text-foreground leading-snug flex-1">{ex.hook_text || ex.content.slice(0, 80)}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => handleReextract(ex)}
                          disabled={reextracting === ex.id}
                          title="Re-extract metadata with updated AI prompt"
                        >
                          {reextracting === ex.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => handleToggleExample(ex.id, !ex.active)}
                        >{ex.active ? "Disable" : "Enable"}</Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteExample(ex.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {ex.tone && <Badge variant="outline" className="text-xs">{ex.tone}</Badge>}
                      {ex.hook_type && <Badge variant="outline" className="text-xs">{ex.hook_type}</Badge>}
                      {ex.engagement_tier && (
                        <Badge className={`text-xs ${ex.engagement_tier === "viral" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : ex.engagement_tier === "high" ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground"}`}>
                          {ex.engagement_tier}
                        </Badge>
                      )}
                      {ex.reactions != null && <span className="text-xs text-muted-foreground">❤️ {ex.reactions}</span>}
                      {ex.comments != null && <span className="text-xs text-muted-foreground">💬 {ex.comments}</span>}
                      {ex.reposts != null && <span className="text-xs text-muted-foreground">🔁 {ex.reposts}</span>}
                      {ex.media_type && ex.media_type !== "text_only" && <Badge variant="secondary" className="text-xs">{ex.media_type}</Badge>}
                      {ex.char_count && <span className="text-xs text-muted-foreground">{ex.char_count} chars</span>}
                      <span className="text-xs text-muted-foreground">{ex.source}</span>
                      {ex.source_url && (
                        <a href={ex.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">View original →</a>
                      )}
                    </div>
                    {ex.why_it_works && (
                      <p className="text-xs text-muted-foreground italic">{ex.why_it_works}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">System Prompt Template</CardTitle>
              <CardDescription>
                The base instructions for the AI. Use <code className="bg-muted px-1 rounded">{"{{harvey_profile}}"}</code>, <code className="bg-muted px-1 rounded">{"{{icp}}"}</code>, <code className="bg-muted px-1 rounded">{"{{voice_rules}}"}</code>, <code className="bg-muted px-1 rounded">{"{{knowledge_base}}"}</code>, and <code className="bg-muted px-1 rounded">{"{{writing_examples}}"}</code> as placeholders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.content_system_prompt || ""}
                onChange={(e) => setSettings({ ...settings, content_system_prompt: e.target.value })}
                rows={8}
                placeholder="You are Harvey's content AI..."
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Post Scorer Prompt</CardTitle>
              <CardDescription>Instructions for analyzing post quality.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.post_scorer_prompt || ""}
                onChange={(e) => setSettings({ ...settings, post_scorer_prompt: e.target.value })}
                rows={8}
                placeholder="You are a LinkedIn post quality analyst..."
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Reddit Comment Template</CardTitle>
              <CardDescription>
                Placeholders: <code className="bg-muted px-1 rounded">{"{{trendTitle}}"}</code>, <code className="bg-muted px-1 rounded">{"{{threadContext}}"}</code>, <code className="bg-muted px-1 rounded">{"{{archetypeSelection}}"}</code>, <code className="bg-muted px-1 rounded">{"{{archetypeList}}"}</code>, <code className="bg-muted px-1 rounded">{"{{harveyRules}}"}</code>, <code className="bg-muted px-1 rounded">{"{{commentSize}}"}</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.reddit_comment_prompt || ""}
                onChange={(e) => setSettings({ ...settings, reddit_comment_prompt: e.target.value })}
                rows={8}
                placeholder="You are writing a Reddit comment..."
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">LinkedIn Comment Template</CardTitle>
              <CardDescription>
                Placeholders: <code className="bg-muted px-1 rounded">{"{{postContent}}"}</code>, <code className="bg-muted px-1 rounded">{"{{archetypeSelection}}"}</code>, <code className="bg-muted px-1 rounded">{"{{archetypeList}}"}</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.linkedin_comment_prompt || ""}
                onChange={(e) => setSettings({ ...settings, linkedin_comment_prompt: e.target.value })}
                rows={8}
                placeholder="You are writing a LinkedIn comment..."
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">Trend Search Template</CardTitle>
              <CardDescription>
                How AI searches for trends. Placeholder: <code className="bg-muted px-1 rounded">{"{{topicClusters}}"}</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.trend_search_prompt || ""}
                onChange={(e) => setSettings({ ...settings, trend_search_prompt: e.target.value })}
                rows={8}
                placeholder="Search for the top 10 trending topics..."
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompt" className="space-y-6 mt-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Assembled System Prompt</CardTitle>
                  <CardDescription>Auto-assembled from Brand, ICP, Voice Rules and Knowledge Base above.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleLoadPrompt(true)} disabled={loadingPrompt}>
                  {loadingPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Rebuild
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingPrompt && !systemPrompt ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : systemPrompt ? (
                <Textarea
                  readOnly
                  value={systemPrompt}
                  className="font-mono text-xs min-h-[500px] bg-muted resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground">Click the tab to load the assembled prompt.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
