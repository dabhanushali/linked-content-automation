"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { PostCard } from "@/components/post-card"
import { CarouselCard } from "@/components/carousel-card"
import { Trend, GeneratedPost, Language, Tone, PostSize } from "@/lib/types"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Loader2, RefreshCw, FileText, LayoutDashboard } from "lucide-react"
import { toast } from "@/hooks/use-toast"

const tones: Tone[] = ["Direct & Bold", "Data-Driven", "Contrarian", "Storytelling", "HOW TO", "WHAT TO"]
const toneDescriptions: Record<Tone, string> = {
  "Direct & Bold": "Strong opinions, no hedging. Own the take.",
  "Data-Driven": "Lead with stats and numbers. Every claim backed by evidence.",
  "Contrarian": "Challenge conventional wisdom. Open with a hot take.",
  "Storytelling": "Open with a real scenario a sales rep would recognize.",
  "HOW TO": "Curiosity-gap hook + 3–5 numbered actionable steps + closing question.",
  "WHAT TO": "Bold contrarian hook + DO/DON'T contrasts + polarizing closing question.",
}
const competitors = ["Salesloft", "Apollo", "Clay", "Lemlist"]

function GenerateContent() {
  const searchParams = useSearchParams()
  const trendId = searchParams.get("trendId")

  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null)
  const [language, setLanguage] = useState<Language>("EN")
  const [tone, setTone] = useState<Tone>("Direct & Bold")
  const [postCount, setPostCount] = useState([4])
  const [postSize, setPostSize] = useState<PostSize>("Medium")
  const [humanityLevel, setHumanityLevel] = useState([3])
  const [userGuidance, setUserGuidance] = useState("")
  const [includeCompetitor, setIncludeCompetitor] = useState(false)
  const [manualContent, setManualContent] = useState("")

  const humanityLabels: Record<number, string> = {
    1: "Polished & structured",
    2: "Professional with warmth",
    3: "Balanced",
    4: "Conversational & personal",
    5: "Raw & human",
  }
  const [isGenerating, setIsGenerating] = useState(false)
  const [posts, setPosts] = useState<GeneratedPost[]>([])

  useEffect(() => {
    if (!trendId) return
    const stored = sessionStorage.getItem("selectedTrend")
    if (stored) {
      const trend: Trend = JSON.parse(stored)
      if (trend.id === trendId) {
        setSelectedTrend(trend)
        return
      }
    }
  }, [trendId])

  // Empty state — no topic selected
  if (!trendId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <Card className="border-dashed border-border/60 max-w-sm w-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-sm font-semibold text-foreground mb-2">No topic selected</h2>
            <p className="text-xs text-muted-foreground mb-6 max-w-sm">
              Go to the dashboard, pick a trending topic, and click "Generate Posts".
            </p>
            <Button asChild size="sm">
              <Link href="/">Browse Trends</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const generatePosts = async () => {
    if (!selectedTrend) return
    setIsGenerating(true)
    setPosts([])

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trend: selectedTrend,
          language,
          tone,
          postCount: postCount[0],
          postSize,
          humanityLevel: humanityLevel[0],
          userGuidance,
          includeCompetitor,
          manualContent: manualContent.trim() || undefined,
        }),
      })

      if (!response.ok) throw new Error("Generation failed")

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.trim()) {
            try {
              const post = JSON.parse(line)
              if (post.error) throw new Error(post.error)
              setPosts((prev) => [...prev, post])
            } catch {}
          }
        }
      }
    } catch {
      toast({
        title: "Generation failed",
        description: "Something went wrong. Check your API key and try again.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-all duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Change topic
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr] animate-slide-up">
        {/* Left Panel - Controls */}
        <div className="space-y-6">
          <Card className="border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold">Post Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selected Trend */}
              {selectedTrend ? (
                <div className="rounded-lg bg-muted/40 border border-border/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Selected Topic
                  </p>
                  <p className="text-sm font-medium text-foreground">{selectedTrend.title}</p>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/40 border border-border/40 p-3 animate-pulse">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Selected Topic
                  </p>
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </div>
              )}

              <Separator />

              {/* Language Toggle */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Language</label>
                <Tabs value={language} onValueChange={(v) => setLanguage(v as Language)}>
                  <TabsList className="grid w-full grid-cols-2 h-8">
                    <TabsTrigger value="EN" className="text-xs">English</TabsTrigger>
                    <TabsTrigger value="RU" className="text-xs">Russian</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Tone Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tone</label>
                <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tones.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{toneDescriptions[tone]}</p>
              </div>

              {/* Post Size */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Post Format</label>
                <Tabs value={postSize} onValueChange={(v) => setPostSize(v as PostSize)}>
                  <TabsList className="grid w-full grid-cols-4 h-8">
                    <TabsTrigger value="Short" className="text-xs">Short</TabsTrigger>
                    <TabsTrigger value="Medium" className="text-xs">Medium</TabsTrigger>
                    <TabsTrigger value="Long" className="text-xs">Long</TabsTrigger>
                    <TabsTrigger value="Carousel" className="text-xs">Carousel</TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground">
                  {postSize === "Short" && "400–600 characters · punchy & concise"}
                  {postSize === "Medium" && "700–1000 characters · balanced depth"}
                  {postSize === "Long" && "1200–1800 characters · full story & data"}
                  {postSize === "Carousel" && "7-slide document post · 6.6% avg engagement vs 2% for text"}
                </p>
              </div>

              <Separator />

              {/* User Guidance */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Additional guidance <span className="normal-case font-normal">(optional)</span></label>
                <Textarea
                  value={userGuidance}
                  onChange={(e) => setUserGuidance(e.target.value)}
                  placeholder="e.g. mention our new pricing, focus on outbound SDRs, avoid mentioning AI..."
                  className="resize-none text-sm min-h-[80px]"
                />
              </div>

              {/* Manual Article Content */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Full article content <span className="normal-case font-normal">(optional — paste if source is paywalled)</span>
                </label>
                <Textarea
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  placeholder="Paste the full article text here..."
                  className="resize-none text-sm min-h-[100px]"
                />
              </div>

              <Separator />

              {/* Humanity Level */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Humanity Level</label>
                  <span className="text-xs text-muted-foreground">{humanityLabels[humanityLevel[0]]}</span>
                </div>
                <Slider
                  value={humanityLevel}
                  onValueChange={setHumanityLevel}
                  min={1}
                  max={5}
                  step={1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Polished</span>
                  <span>Human</span>
                </div>
              </div>

              {/* Post Count Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Number of Posts</label>
                  <span className="text-xs font-medium text-foreground">{postCount[0]}</span>
                </div>
                <Slider
                  value={postCount}
                  onValueChange={setPostCount}
                  min={3}
                  max={6}
                  step={1}
                />
              </div>

              {/* Competitor Angle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="competitor"
                  checked={includeCompetitor}
                  onCheckedChange={(checked) => setIncludeCompetitor(checked as boolean)}
                />
                <Label
                  htmlFor="competitor"
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  Include competitor angle ({competitors.join(", ")})
                </Label>
              </div>

              {/* Generate Button */}
              <Button
                onClick={generatePosts}
                disabled={isGenerating || !selectedTrend}
                className="w-full h-10"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Crafting Harvey-voiced posts...
                  </>
                ) : (
                  "Generate Posts"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Generated Posts */}
        <div className="space-y-4">
          {posts.length > 0 && (
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Generated Posts</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={generatePosts}
                disabled={isGenerating}
                className="hover:bg-muted/50 transition-colors duration-150"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                Regenerate All
              </Button>
            </div>
          )}

          {posts.length === 0 && !isGenerating ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">
                  No posts generated yet
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Configure your settings and click Generate Posts.
                </p>
              </CardContent>
            </Card>
          ) : isGenerating && posts.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Crafting Harvey-voiced posts...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                post.format === "carousel"
                  ? <CarouselCard key={post.id} post={post} />
                  : <PostCard key={post.id} post={post} />
              ))}
              {isGenerating && (
                <Card className="border-border/60">
                  <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                    <p className="text-xs text-muted-foreground">Generating more posts...</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16 animate-fade-in">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <GenerateContent />
    </Suspense>
  )
}
