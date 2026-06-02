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
import {
  Loader2,
  Send,
  ExternalLink,
  Terminal,
  TrendingUp,
  Hash,
  RefreshCw,
  Trash2,
  Sparkles,
  Lightbulb,
  Brain,
  Compass,
  Globe,
  FileText,
  CheckCircle2,
  X,
  Plus
} from "lucide-react"
import { ScrapingProvider, GeoKeyword, GeoRedditPost, GeoCluster, GeoLlmSuggestion, GeoWebsiteIndex } from "@/lib/reddit/types"

function getFallbackQuestions(phrase: string) {
  const p = phrase || "outsourced software company"
  
  return [
    // Informational (5 questions)
    {
      question: `What are the primary benefits of hiring an ${p}?`,
      search_intent: "informational" as const,
      motive_summary: "User wants to understand value propositions, strategic advantages, and cost-benefit analysis."
    },
    {
      question: `How does an ${p} manage remote project delivery?`,
      search_intent: "informational" as const,
      motive_summary: "User is investigating operational models, communication workflows, and project management tools."
    },
    {
      question: `What are the key risks when partnering with an ${p}?`,
      search_intent: "informational" as const,
      motive_summary: "User seeks to mitigate risks around IP theft, code quality, communication barriers, and timezone issues."
    },
    {
      question: `What is the average hourly rate for an ${p}?`,
      search_intent: "informational" as const,
      motive_summary: "User is in the early budgeting phase and comparing global rates across different regions."
    },
    {
      question: `How to write a comprehensive RFP for an ${p}?`,
      search_intent: "informational" as const,
      motive_summary: "User is preparing to solicit bids and needs structural guidelines to evaluate vendors effectively."
    },

    // Commercial (5 questions)
    {
      question: `Top 10 rated ${p}s for enterprise custom software`,
      search_intent: "commercial" as const,
      motive_summary: "User is actively researching and comparing top-tier vendors, reading case studies and reviews."
    },
    {
      question: `Freelance developers vs an established ${p}: Which is better?`,
      search_intent: "commercial" as const,
      motive_summary: "User is evaluating the trade-offs between cheap individual freelancers and structured team agencies."
    },
    {
      question: `How to evaluate the portfolio of an ${p}?`,
      search_intent: "commercial" as const,
      motive_summary: "User wants to verify technical competency, check references, and detect fake credentials."
    },
    {
      question: `What contract models do most ${p}s offer?`,
      search_intent: "commercial" as const,
      motive_summary: "User is comparing Fixed Price, Time & Materials, and Dedicated Team contract structures."
    },
    {
      question: `Red flags to watch out for when vetting an ${p}`,
      search_intent: "commercial" as const,
      motive_summary: "User wants a checklist of negative indicators (poor communication, high turnover, lack of transparency)."
    },

    // Navigational (5 questions)
    {
      question: `Client login portal for leading ${p} services`,
      search_intent: "navigational" as const,
      motive_summary: "User is looking for direct access to their active vendor's portal, Jira dashboard, or codebase."
    },
    {
      question: `${p} pricing calculator tool online`,
      search_intent: "navigational" as const,
      motive_summary: "User wants to navigate directly to interactive cost estimation tools on top vendor websites."
    },
    {
      question: `${p} case studies and client testimonials page`,
      search_intent: "navigational" as const,
      motive_summary: "User is searching specifically for proof-of-work pages on specific vendor sites to present to stakeholders."
    },
    {
      question: `Contact details and office locations for premium ${p}s`,
      search_intent: "navigational" as const,
      motive_summary: "User wants to find physical addresses, phone numbers, or booking forms to schedule an intake call."
    },
    {
      question: `Careers and open software engineering roles at an ${p}`,
      search_intent: "navigational" as const,
      motive_summary: "User or job seeker is looking to navigate to the company's application page."
    }
  ]
}

const getDonutPath = (cx: number, cy: number, rInner: number, rOuter: number, startAngleDeg: number, endAngleDeg: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  
  const sRad = toRad(startAngleDeg)
  const eRad = toRad(endAngleDeg)
  
  const x1 = cx + rOuter * Math.cos(sRad)
  const y1 = cy + rOuter * Math.sin(sRad)
  
  const x2 = cx + rOuter * Math.cos(eRad)
  const y2 = cy + rOuter * Math.sin(eRad)
  
  const x3 = cx + rInner * Math.cos(eRad)
  const y3 = cy + rInner * Math.sin(eRad)
  
  const x4 = cx + rInner * Math.cos(sRad)
  const y4 = cy + rInner * Math.sin(sRad)
  
  const largeArcFlag = endAngleDeg - startAngleDeg > 180 ? 1 : 0
  
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`
}

export default function GeoPage() {
  const [newKeyword, setNewKeyword] = useState("")
  const [insightsMode, setInsightsMode] = useState<"reddit" | "ai_wheel">("reddit")
  const [selectedIntent, setSelectedIntent] = useState<"informational" | "commercial" | "navigational">("informational")
  const [hoveredIntent, setHoveredIntent] = useState<string | null>(null)
  const [provider, setProvider] = useState<ScrapingProvider>("puppeteer")
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<GeoKeyword[]>([])
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(null)
  
  // Details state
  const [details, setDetails] = useState<{
    keyword: GeoKeyword | null
    posts: GeoRedditPost[]
    clusters: GeoCluster[]
    suggestions: GeoLlmSuggestion[]
    coverage: GeoWebsiteIndex[]
  } | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sitemap state
  const [sitemapUrl, setSitemapUrl] = useState("")
  const [manualTitle, setManualTitle] = useState("")
  const [manualUrl, setManualUrl] = useState("")
  const [manualList, setManualList] = useState<Array<{ url: string; title: string; meta_description: string | null }>>([])
  const [sitemapScanning, setSitemapScanning] = useState(false)
  const [auditMode, setAuditMode] = useState<"sitemap" | "manual">("sitemap")

  // Selected Topic Deep-Dive index
  const [activeClusterIndex, setActiveClusterIndex] = useState<number>(0)
  const [activeEngineTab, setActiveEngineTab] = useState<"unified" | "gemini" | "chatgpt" | "claude" | "perplexity">("unified")

  // Brief state
  const [briefModalOpen, setBriefModalOpen] = useState(false)
  const [briefGenerating, setBriefGenerating] = useState(false)
  const [activeBrief, setActiveBrief] = useState<string>("")
  const [briefTitle, setBriefTitle] = useState("")

  useEffect(() => {
    fetchHistory()
  }, [])

  useEffect(() => {
    if (activeKeywordId) {
      fetchDetails(activeKeywordId)
    } else {
      setDetails(null)
    }
  }, [activeKeywordId])

  async function fetchHistory() {
    try {
      const res = await fetch("/api/geo/keyword/list")
      if (res.ok) {
        const data = await res.json()
        setHistory(data.keywords || [])
        if (data.keywords && data.keywords.length > 0 && !activeKeywordId) {
          setActiveKeywordId(data.keywords[0].id)
        }
      }
    } catch (err) {
      console.error("Failed to fetch history:", err)
    }
  }

  async function fetchDetails(id: string) {
    setDetailsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/geo/keyword/details?id=${id}`)
      if (res.ok) {
        const data = await res.json()
        setDetails(data)
        setActiveClusterIndex(0)
      } else {
        setError("Failed to load keyword details.")
      }
    } catch {
      setError("Failed to load keyword details due to connection error.")
    } finally {
      setDetailsLoading(false)
    }
  }

  async function handleScanSubmit() {
    if (!newKeyword.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/geo/keyword/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: newKeyword.trim(), provider })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Scraping & clustering pipeline failed")
      } else {
        setNewKeyword("")
        await fetchHistory()
        if (data.keywordId) {
          setActiveKeywordId(data.keywordId)
        }
      }
    } catch (err) {
      setError("Connection error. Could not reach scanner api.")
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteKeyword(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/geo/keyword/list?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        setHistory(prev => prev.filter(k => k.id !== id))
        if (activeKeywordId === id) {
          setActiveKeywordId(null)
        }
      }
    } catch (err) {
      console.error("Delete failed:", err)
    }
  }

  async function handleSitemapAudit() {
    if (!activeKeywordId) return
    setSitemapScanning(true)
    setError(null)
    try {
      let body: any = { keywordId: activeKeywordId }
      if (auditMode === "sitemap") {
        if (!sitemapUrl.trim()) return
        body.sitemapUrl = sitemapUrl.trim()
      } else {
        if (manualList.length === 0) return
        body.manualTitles = manualList
      }

      const res = await fetch("/api/geo/sitemap/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Sitemap coverage audit failed")
      } else {
        await fetchDetails(activeKeywordId)
        setManualList([])
      }
    } catch {
      setError("Network error running sitemap coverage scan.")
    } finally {
      setSitemapScanning(false)
    }
  }

  async function handleGenerateBrief(
    clusterId: string | null,
    title: string,
    question?: string,
    keywordId?: string
  ) {
    setBriefTitle(title)
    setBriefModalOpen(true)
    setBriefGenerating(true)
    setActiveBrief("")
    try {
      const body: any = {}
      if (clusterId) {
        body.clusterId = clusterId
      } else {
        body.question = question
        body.keywordId = keywordId
      }

      const res = await fetch("/api/geo/brief/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        setActiveBrief(data.brief || "")
      } else {
        setActiveBrief(`### Error\n\nFailed to generate content outline: ${data.error || "Unknown server error."}`)
      }
    } catch {
      setActiveBrief("### Connection Error\n\nFailed to generate content outline. Check your local dev connection.")
    } finally {
      setBriefGenerating(false)
    }
  }

  function addManualBlog() {
    if (!manualTitle.trim()) return
    const fakeUrl = manualUrl.trim() || `https://my-blog.com/blog/${manualTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    setManualList(prev => [...prev, { url: fakeUrl, title: manualTitle.trim(), meta_description: null }])
    setManualTitle("")
    setManualUrl("")
  }

  // Analytics score mapping
  const opportunityScore = details ? Math.min(
    Math.round(
      (details.clusters.filter(c => {
        const matchingIndex = details.coverage.find(cov => cov.matching_cluster_id === c.id)
        return !matchingIndex || matchingIndex.coverage_status === "uncovered"
      }).length / Math.max(details.clusters.length, 1)) * 100
    ) || 0,
    100
  ) : 0

  const sitemapCoverageScore = details ? Math.round(
    (details.coverage.filter(cov => cov.coverage_status === "covered").length / Math.max(details.coverage.length, 1)) * 100
  ) || 0 : 0

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-w-6xl mx-auto space-y-4 px-2 relative">
      {/* Top Section: Phrase Scanner Input */}
      <div className="rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md p-5 shadow-sm relative overflow-hidden bg-gradient-to-br from-card to-accent/[0.02] hover:border-accent/15 transition-all duration-300">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent animate-pulse" />
              GEO Content Engine
            </h2>
            <p className="text-[11px] text-muted-foreground/80 font-medium">
              Monitor key topics, cluster search traffic, and audit website gaps for LLM citations.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-1 md:max-w-xl">
            <Input
              placeholder="Enter search keyword... (e.g. outsourced software company)"
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              disabled={loading}
              className="text-xs h-9 bg-background/50 border-border/15 rounded-lg focus-visible:ring-1 focus-visible:ring-accent/40"
            />
            <Select value={provider} onValueChange={v => setProvider(v as ScrapingProvider)}>
              <SelectTrigger className="h-9 w-[130px] text-xs border-border/15 bg-background/50 gap-1 rounded-lg hover:bg-secondary/40 hover:text-foreground transition-all duration-200">
                <Terminal className="h-3 w-3 text-accent" />
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="puppeteer" className="text-xs">Local Puppeteer</SelectItem>
                <SelectItem value="reddit_api" className="text-xs">Reddit API</SelectItem>
                <SelectItem value="apify" className="text-xs">Apify</SelectItem>
                <SelectItem value="firecrawl" className="text-xs">Firecrawl</SelectItem>
                <SelectItem value="tavily" className="text-xs">Tavily</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleScanSubmit} disabled={loading || !newKeyword.trim()} size="sm" className="h-9 px-4 gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground shadow-md shadow-accent/5 transition-all duration-300 hover:scale-[1.02]">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Scan
            </Button>
          </div>
        </div>
        {error && (
          <div className="mt-3 p-3.5 rounded-2xl border border-destructive/20 bg-destructive/5 animate-slide-up text-left">
            <div className="flex items-center gap-2 mb-2 text-destructive font-bold text-xs uppercase tracking-wider">
              <Terminal className="h-4 w-4" />
              <span>GEO Scanner Debugger Logs</span>
            </div>
            <p className="text-xs text-foreground/90 font-mono bg-black/40 p-2.5 rounded-lg border border-border/40 whitespace-pre-wrap">
              {error}
            </p>
            <div className="flex items-center gap-2 mt-2.5 text-[10px] text-muted-foreground font-medium">
              <span>Attempted Provider: <strong className="text-foreground uppercase">{provider}</strong></span>
              <span>•</span>
              <span>Recommendation: <span className="text-accent font-medium">{(error.includes("403") || error.includes("blocked") || error.includes("Cloudflare")) ? "Switch your provider dropdown above to 'Apify' or 'Tavily' (which leverage residential proxy bypasses)." : "Check your local chromium setup, internet connection, or API keys."}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: History Side-Panel + Details Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 overflow-hidden min-h-0">
        
        {/* Left column: Phrase History */}
        <div className="col-span-1 rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md p-4 flex flex-col space-y-3.5 overflow-y-auto shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
              History Scans
            </span>
            <Badge variant="secondary" className="text-[9px] font-bold py-0 px-2 rounded-md bg-secondary/40">{history.length}</Badge>
          </div>

          <div className="flex flex-col gap-2">
            {history.map(k => {
              const isSelected = activeKeywordId === k.id
              return (
                <div
                  key={k.id}
                  onClick={() => setActiveKeywordId(isSelected ? null : k.id)}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? "bg-accent/10 border-accent/30 shadow-sm"
                      : "bg-background/50 border-border/10 hover:bg-secondary/40 hover:border-accent/20"
                  }`}
                >
                  <div className="flex flex-col min-w-0 space-y-1">
                    <span className="text-xs font-bold text-foreground truncate">{k.phrase}</span>
                    <span className="text-[9px] text-muted-foreground/80 flex items-center gap-1.5 font-medium">
                      <span className={`h-1.5 w-1.5 rounded-full ${k.status === 'completed' ? 'bg-emerald-500' : k.status === 'failed' ? 'bg-destructive' : 'bg-amber-500 animate-pulse'}`} />
                      {k.status}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteKeyword(k.id, e)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
            {history.length === 0 && (
              <p className="text-[11px] text-muted-foreground italic text-center py-8">
                No search keywords scanned yet.
              </p>
            )}
          </div>
        </div>

        {/* Right three columns: Details dashboard */}
        <div className="col-span-1 md:col-span-3 flex flex-col min-h-0 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {detailsLoading && (
            <div className="flex flex-col items-center justify-center py-24 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-xs text-muted-foreground font-semibold">Loading keyword data & semantic clusters...</p>
            </div>
          )}

          {!detailsLoading && !details && (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card/40 p-12 text-center flex flex-col items-center justify-center">
              <Compass className="h-8 w-8 text-muted-foreground/60 mb-3 animate-pulse" />
              <h3 className="text-xs font-bold text-foreground">Select a Scan Phrase</h3>
              <p className="text-[11px] text-muted-foreground max-w-sm mt-1">
                Choose an item from the history panel or launch a new scan query above to analyze GEO opportunities.
              </p>
            </div>
          )}

          {!detailsLoading && details && (
            <div className="space-y-4 animate-fade-in">
              {/* Analytics Header Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="rounded-2xl border border-border/15 bg-gradient-to-br from-card/60 to-amber-500/5 backdrop-blur-sm shadow-sm p-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.01]">
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80">
                      GEO Content Opportunity Index
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-amber-500">{opportunityScore}%</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Opportunity</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed font-medium">
                      Percentage of discussion clusters currently uncovered on your website.
                    </p>
                  </div>
                </Card>

                <Card className="rounded-2xl border border-border/15 bg-gradient-to-br from-card/60 to-emerald-500/5 backdrop-blur-sm shadow-sm p-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.01]">
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80">
                      Website Coverage Score
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-emerald-500">{sitemapCoverageScore}%</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Covered</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed font-medium">
                      Sitemap coverage representing highly optimized and covered target topics.
                    </p>
                  </div>
                </Card>

                <Card className="rounded-2xl border border-border/15 bg-gradient-to-br from-card/60 to-accent/5 backdrop-blur-sm shadow-sm p-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.01]">
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80">
                      Social Discussion Volume
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-accent">{details.posts.length}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">Posts Analyzed</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed font-medium">
                      Total Reddit threads and comment feeds parsed into semantic clusters.
                    </p>
                  </div>
                </Card>
              </div>

              {/* Intelligence Mode Toggle Control Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 bg-secondary/20 backdrop-blur-md rounded-2xl border border-border/15 shadow-sm relative overflow-hidden bg-gradient-to-r from-card/85 to-accent/[0.02]">
                <div className="flex items-center gap-2 pl-2">
                  <Brain className="h-4 w-4 text-accent animate-pulse" />
                  <span className="text-xs font-bold text-foreground">GEO Intelligence Engine</span>
                </div>
                
                <div className="flex items-center gap-1.5 bg-background/60 p-1 rounded-xl border border-border/50">
                  <button
                    onClick={() => setInsightsMode("reddit")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                      insightsMode === "reddit"
                        ? "bg-accent/15 text-accent border border-accent/10 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/35"
                    }`}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    Reddit Forum Discovery
                  </button>
                  <button
                    onClick={() => setInsightsMode("ai_wheel")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                      insightsMode === "ai_wheel"
                        ? "bg-accent/15 text-accent border border-accent/10 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/35"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Search Intent Wheel
                  </button>
                </div>
              </div>

              {insightsMode === "reddit" ? (
                /* Master Double-Pane Layout for Topics */
                <div className="rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md p-4 space-y-3.5 shadow-sm bg-gradient-to-br from-card to-secondary/15">
                  {/* Subreddits and Source Metrics Ribbon */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 rounded-xl bg-background/50 border border-border/10 text-xs shadow-sm">
                    <div className="space-y-1.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80 block">
                        Target Subreddits Scanned
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set(details.posts.map(p => p.subreddit).filter(Boolean))).length > 0 ? (
                          Array.from(new Set(details.posts.map(p => p.subreddit).filter(Boolean))).map((sub, sIdx) => (
                            <Badge key={sIdx} variant="secondary" className="bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/15 text-[10px] font-bold py-0.5 px-2.5 rounded-md">
                              r/{sub}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic font-medium">No subreddits scraped. Fallback crawling active.</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80 block">
                        Source Threads Analyzed
                      </span>
                      <div className="flex items-center gap-2 text-foreground/90 font-bold">
                        <Hash className="h-4 w-4 text-accent shrink-0 animate-pulse" />
                        <span>Parsed {details.posts.length} real user discussion threads for organic interest.</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/15 pt-3.5">
                    <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-accent animate-pulse" />
                      Reddit Real-time Scanning & Clustering
                    </h3>
                    <span className="text-[10px] text-muted-foreground font-bold">
                      {details.clusters.length} topics grouped semantically
                    </span>
                  </div>

                  {details.clusters.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                      No query patterns identified in these scraped posts. Try running the scan again with another keyword.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {/* Left Pane: Topic Selection List */}
                      <div className="col-span-1 md:col-span-2 flex flex-col gap-2">
                        {details.clusters.map((topic, tIdx) => {
                          const isSelected = activeClusterIndex === tIdx
                          const coverage = details.coverage.find(cov => cov.matching_cluster_id === topic.id)
                          const status = coverage?.coverage_status || "uncovered"

                          return (
                            <button
                              key={topic.id}
                              onClick={() => setActiveClusterIndex(tIdx)}
                              className={`flex flex-col items-start text-left p-3.5 rounded-xl border transition-all duration-300 relative overflow-hidden group ${
                                isSelected
                                  ? "bg-accent/10 border-accent/30 shadow-sm"
                                  : "bg-background/50 border-border/15 hover:bg-secondary/35 hover:border-accent/20"
                              }`}
                            >
                              <div className="flex items-center justify-between w-full gap-2">
                                <span className="text-xs font-bold truncate text-foreground group-hover:text-accent transition-colors leading-tight">
                                  {topic.cluster_name}
                                </span>
                                <Badge className={`text-[8px] py-0.5 px-1.5 rounded uppercase shrink-0 font-black tracking-widest ${
                                  status === "covered"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : status === "needs_optimization"
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                    : "bg-destructive/10 text-destructive border-destructive/20"
                                }`}>
                                  {status === "covered" ? "Covered" : status === "needs_optimization" ? "Gap" : "Missed"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5 font-bold">
                                <span className="text-[8px] tracking-wider py-0.5 px-1 bg-secondary text-muted-foreground rounded uppercase font-black">
                                  {topic.core_intent}
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                  {topic.post_ids.length} posts
                                </span>
                              </div>
                            </button>
                          )
                        })}
                      </div>

                      {/* Right Pane: Selected Cluster Deep-Dive Details */}
                      <div className="col-span-1 md:col-span-3">
                        {(() => {
                          const selectedCluster = details.clusters[activeClusterIndex]
                          if (!selectedCluster) return null
                          const matchingPosts = details.posts.filter(p => selectedCluster.post_ids.includes(p.id))

                          return (
                            <div className="rounded-2xl border border-border/15 bg-gradient-to-br from-card/80 to-accent/[0.01] backdrop-blur-md p-5 space-y-4 shadow-sm animate-fade-in flex flex-col justify-between h-full">
                              <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <h4 className="text-xs font-bold text-foreground leading-tight">
                                      {selectedCluster.cluster_name}
                                    </h4>
                                    <span className="text-[9px] text-muted-foreground/80 mt-0.5 inline-block font-bold">
                                      Core User Intent: <span className="font-extrabold text-accent uppercase">{selectedCluster.core_intent}</span>
                                    </span>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleGenerateBrief(selectedCluster.id, selectedCluster.cluster_name)}
                                    className="h-7 text-[9px] px-2.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-bold shadow-md shadow-accent/5 transition-all duration-300"
                                  >
                                    <FileText className="h-3 w-3 mr-1" /> Brief
                                  </Button>
                                </div>

                                <div className="space-y-1.5">
                                  <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80 flex items-center gap-1">
                                    <Brain className="h-2.5 w-2.5 text-accent animate-pulse" />
                                    What's in their minds
                                  </span>
                                  <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                                    {selectedCluster.summary}
                                  </p>
                                </div>

                                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                                  <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80 block">
                                    Forum Threads & Discussions ({matchingPosts.length})
                                  </span>
                                  {matchingPosts.map((post, pIdx) => (
                                    <div key={post.id || pIdx} className="p-2.5 rounded-xl border border-border/10 bg-background/60 flex items-start justify-between gap-2.5 text-xs hover:border-accent/15 transition-all duration-300 shadow-sm">
                                      <div className="min-w-0 space-y-0.5">
                                        <p className="font-bold text-foreground truncate text-[11px] leading-tight">{post.title}</p>
                                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-medium">
                                          <span className="text-orange-500 font-bold">r/{post.subreddit}</span>
                                          <span>{post.upvotes}↑</span>
                                          <span>{post.num_comments} comments</span>
                                        </div>
                                      </div>
                                      {post.url && (
                                        <a
                                          href={post.url.startsWith("http") ? post.url : `https://reddit.com${post.url}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 rounded hover:bg-secondary/40 transition-colors shrink-0"
                                        >
                                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* AI Search Intent Wheel Mode Panel */
                <div className="rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md p-4 space-y-4 shadow-sm bg-gradient-to-br from-card to-secondary/15">
                  <div className="flex items-center justify-between border-b border-border/20 pb-3">
                    <div className="space-y-0.5">
                      <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-accent animate-pulse" />
                        AI Models Search Intent Wheel
                      </h3>
                      <p className="text-[10px] text-muted-foreground/75 font-medium">
                        Interactive AnswerThePublic intent wheel. Map multi-engine queries to search triggers.
                      </p>
                    </div>
                    
                    <Badge variant="outline" className="text-[9px] uppercase font-black tracking-wider py-0.5 px-2 bg-accent/5 text-accent border-accent/15">
                      {selectedIntent} Intent
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
                    {/* SVG Radial Wheel Card (Left 2 Columns) */}
                    <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center p-4 rounded-2xl border border-border/15 bg-background/55 backdrop-blur-sm shadow-sm relative min-h-[300px] bg-gradient-to-br from-card/40 to-transparent">
                      <svg width="280" height="280" viewBox="0 0 300 300" className="drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]">
                        <defs>
                          <linearGradient id="infoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity={selectedIntent === 'informational' ? 0.85 : 0.25} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={selectedIntent === 'informational' ? 0.95 : 0.35} />
                          </linearGradient>
                          <linearGradient id="commGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#c084fc" stopOpacity={selectedIntent === 'commercial' ? 0.85 : 0.25} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={selectedIntent === 'commercial' ? 0.95 : 0.35} />
                          </linearGradient>
                          <linearGradient id="navGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={selectedIntent === 'navigational' ? 0.85 : 0.25} />
                            <stop offset="100%" stopColor="#14b8a6" stopOpacity={selectedIntent === 'navigational' ? 0.95 : 0.35} />
                          </linearGradient>
                          
                          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="5" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                        </defs>

                        {/* Informational Slice (Angle: -88 to 28 Deg) */}
                        <path
                          d={getDonutPath(150, 150, 65, 125, -88, 28)}
                          fill="url(#infoGrad)"
                          stroke={selectedIntent === 'informational' ? '#818cf8' : 'rgba(99, 102, 241, 0.3)'}
                          strokeWidth={selectedIntent === 'informational' ? '2.5' : '1'}
                          className={`cursor-pointer transition-all duration-300 ease-out origin-[150px_150px] ${
                            selectedIntent === 'informational' 
                              ? 'scale-[1.04]' 
                              : hoveredIntent === 'informational' 
                              ? 'scale-[1.02] opacity-90' 
                              : 'scale-100 opacity-75 hover:opacity-90'
                          }`}
                          filter={selectedIntent === 'informational' ? 'url(#glow)' : 'none'}
                          onClick={() => setSelectedIntent('informational')}
                          onMouseEnter={() => setHoveredIntent('informational')}
                          onMouseLeave={() => setHoveredIntent(null)}
                        />

                        {/* Commercial Slice (Angle: 32 to 148 Deg) */}
                        <path
                          d={getDonutPath(150, 150, 65, 125, 32, 148)}
                          fill="url(#commGrad)"
                          stroke={selectedIntent === 'commercial' ? '#c084fc' : 'rgba(168, 85, 247, 0.3)'}
                          strokeWidth={selectedIntent === 'commercial' ? '2.5' : '1'}
                          className={`cursor-pointer transition-all duration-300 ease-out origin-[150px_150px] ${
                            selectedIntent === 'commercial' 
                              ? 'scale-[1.04]' 
                              : hoveredIntent === 'commercial' 
                              ? 'scale-[1.02] opacity-90' 
                              : 'scale-100 opacity-75 hover:opacity-90'
                          }`}
                          filter={selectedIntent === 'commercial' ? 'url(#glow)' : 'none'}
                          onClick={() => setSelectedIntent('commercial')}
                          onMouseEnter={() => setHoveredIntent('commercial')}
                          onMouseLeave={() => setHoveredIntent(null)}
                        />

                        {/* Navigational Slice (Angle: 152 to 268 Deg) */}
                        <path
                          d={getDonutPath(150, 150, 65, 125, 152, 268)}
                          fill="url(#navGrad)"
                          stroke={selectedIntent === 'navigational' ? '#2dd4bf' : 'rgba(20, 184, 166, 0.3)'}
                          strokeWidth={selectedIntent === 'navigational' ? '2.5' : '1'}
                          className={`cursor-pointer transition-all duration-300 ease-out origin-[150px_150px] ${
                            selectedIntent === 'navigational' 
                              ? 'scale-[1.04]' 
                              : hoveredIntent === 'navigational' 
                              ? 'scale-[1.02] opacity-90' 
                              : 'scale-100 opacity-75 hover:opacity-90'
                          }`}
                          filter={selectedIntent === 'navigational' ? 'url(#glow)' : 'none'}
                          onClick={() => setSelectedIntent('navigational')}
                          onMouseEnter={() => setHoveredIntent('navigational')}
                          onMouseLeave={() => setHoveredIntent(null)}
                        />

                        {/* Inner Glassmorphic Center Hub */}
                        <circle cx="150" cy="150" r="58" className="fill-card/95 stroke-border/15 shadow-sm" />

                        {/* Center Hub Labeling (ForeignObject for Flex layout) */}
                        <foreignObject x="92" y="92" width="116" height="116">
                          <div className="w-full h-full flex flex-col items-center justify-center text-center p-2 rounded-full overflow-hidden select-none pointer-events-none">
                            <span className="text-[8px] uppercase tracking-widest text-muted-foreground/80 font-extrabold leading-none">Intent</span>
                            <span className={`text-[10px] font-black uppercase mt-1 leading-none transition-colors duration-300 ${
                              selectedIntent === 'informational' ? 'text-indigo-400' :
                              selectedIntent === 'commercial' ? 'text-purple-400' :
                              'text-teal-400'
                            }`}>
                              {selectedIntent}
                            </span>
                            
                            <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap max-w-[90px]">
                              <span className="text-[7px] font-bold py-0.5 px-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-sm leading-none" title="Gemini">Gem</span>
                              <span className="text-[7px] font-bold py-0.5 px-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-sm leading-none" title="ChatGPT">GPT</span>
                              <span className="text-[7px] font-bold py-0.5 px-1 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-sm leading-none" title="Claude">Cld</span>
                            </div>
                          </div>
                        </foreignObject>
                      </svg>
                      
                      {/* Explanatory Indicators */}
                      <div className="absolute bottom-2 flex items-center justify-center gap-3 text-[9px] text-muted-foreground/80 font-bold">
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" /> Informational</span>
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" /> Commercial</span>
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" /> Navigational</span>
                      </div>
                    </div>

                    {/* Question Explorer Panel (Right 3 Columns) */}
                    <div className="col-span-1 md:col-span-3 flex flex-col min-w-0 h-[340px] overflow-hidden">
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                        {(() => {
                          const qList = Array.isArray(details.keyword?.ai_questions_json) 
                            ? details.keyword.ai_questions_json 
                            : getFallbackQuestions(details.keyword?.phrase || "")
                          
                          const filtered = qList.filter(q => q.search_intent === selectedIntent)

                          if (filtered.length === 0) {
                            return (
                              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                                No questions found for this intent category.
                              </div>
                            )
                          }

                          return filtered.map((q, qIdx) => (
                            <div 
                              key={qIdx} 
                              className="p-3.5 rounded-xl border border-border/15 bg-card/40 backdrop-blur-md hover:bg-secondary/20 hover:border-accent/20 hover:shadow-[0_2px_12px_-5px_rgba(var(--accent),0.05)] transition-all duration-300 flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1.5 min-w-0 flex-1">
                                <p className="font-bold text-foreground leading-snug">{q.question}</p>
                                <p className="text-[10px] text-muted-foreground/80 leading-normal flex items-start gap-1 font-mono">
                                  <Lightbulb className={`h-3 w-3 shrink-0 mt-0.5 ${
                                    selectedIntent === 'informational' ? 'text-indigo-400' :
                                    selectedIntent === 'commercial' ? 'text-purple-400' :
                                    'text-teal-400'
                                  }`} />
                                  <span><strong className="text-foreground/80 font-bold">User Motive:</strong> {q.motive_summary}</span>
                                </p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateBrief(null, q.question, q.question, details.keyword?.id)}
                                className="h-7 text-[9px] px-2.5 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground shrink-0 font-bold shadow-md shadow-accent/5 transition-all duration-300"
                              >
                                <FileText className="h-3 w-3 mr-1" /> Brief
                              </Button>
                            </div>
                          ))
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sitemap & Coverage Audit Scanner */}
              <div className="rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md p-5 space-y-4 shadow-sm bg-gradient-to-br from-card to-accent/[0.01] relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/15 pb-2">
                  <div className="space-y-0.5">
                    <h3 className="text-xs uppercase font-bold tracking-wider text-foreground flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-emerald-500" />
                      Website Coverage Audit & Sitemap Crawler
                    </h3>
                    <p className="text-[10px] text-muted-foreground/80 font-medium">
                      Map these target topics against your published articles to instantly find gap opportunities.
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-lg text-[9px] font-bold">
                    <button
                      onClick={() => setAuditMode("sitemap")}
                      className={`px-2.5 py-1 rounded-md transition-all duration-200 ${auditMode === "sitemap" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Sitemap URL
                    </button>
                    <button
                      onClick={() => setAuditMode("manual")}
                      className={`px-2.5 py-1 rounded-md transition-all duration-200 ${auditMode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Manual Titles
                    </button>
                  </div>
                </div>

                {auditMode === "sitemap" ? (
                  <div className="flex items-center gap-2 max-w-2xl">
                    <Input
                      placeholder="Enter sitemap.xml URL... (e.g. https://yourdomain.com/sitemap.xml)"
                      value={sitemapUrl}
                      onChange={e => setSitemapUrl(e.target.value)}
                      disabled={sitemapScanning}
                      className="text-xs h-9 bg-background/50 border-border/15 rounded-lg focus-visible:ring-1 focus-visible:ring-accent/40"
                    />
                    <Button onClick={handleSitemapAudit} disabled={sitemapScanning || !sitemapUrl.trim()} size="sm" className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-md transition-all duration-300 shrink-0">
                      {sitemapScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                      Audit Sitemap
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 max-w-3xl">
                      <Input
                        placeholder="Blog Article Title... (e.g. How to Hire a SaaS Developer)"
                        value={manualTitle}
                        onChange={e => setManualTitle(e.target.value)}
                        className="text-xs h-9 bg-background/50 border-border/15 rounded-lg focus-visible:ring-1 focus-visible:ring-accent/40"
                      />
                      <Input
                        placeholder="URL (Optional)..."
                        value={manualUrl}
                        onChange={e => setManualUrl(e.target.value)}
                        className="text-xs h-9 bg-background/50 border-border/15 rounded-lg focus-visible:ring-1 focus-visible:ring-accent/40"
                      />
                      <Button onClick={addManualBlog} size="icon" className="h-9 w-9 shrink-0 rounded-lg">
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={handleSitemapAudit}
                        disabled={sitemapScanning || manualList.length === 0}
                        size="sm"
                        className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-md transition-all duration-300 shrink-0"
                      >
                        {sitemapScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Run Semantic Audit ({manualList.length})
                      </Button>
                    </div>

                    {/* Manual List Badges */}
                    {manualList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-background/40 border border-border/15 max-h-[100px] overflow-y-auto pr-1">
                        {manualList.map((item, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[9px] font-bold pr-1.5 gap-1 py-0.5">
                            <span className="truncate max-w-[200px]">{item.title}</span>
                            <button
                              onClick={() => setManualList(prev => prev.filter((_, i) => i !== idx))}
                              className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Crawled Index Heat-Map Display */}
                {details.coverage.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 block">
                      Crawled Content Index ({details.coverage.length} pages matched)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                      {details.coverage.map((cov, covIdx) => {
                        const matchedCluster = details.clusters.find(c => c.id === cov.matching_cluster_id)
                        return (
                          <div
                            key={cov.id || covIdx}
                            className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs bg-background/60 shadow-sm transition-all duration-300 ${
                              cov.coverage_status === "covered"
                                ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                                : cov.coverage_status === "needs_optimization"
                                ? "border-amber-500/20 bg-amber-500/[0.02]"
                                : "border-border/15"
                            }`}
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="font-bold text-foreground truncate leading-snug">{cov.title}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[8px] px-1.5 py-0.5 font-black uppercase rounded tracking-wider ${
                                  cov.coverage_status === "covered"
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : cov.coverage_status === "needs_optimization"
                                    ? "bg-amber-500/10 text-amber-500"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  {cov.coverage_status.replace("_", " ")}
                                </span>
                                {matchedCluster && (
                                  <span className="text-[9px] text-muted-foreground font-semibold truncate max-w-[120px]">
                                    → {matchedCluster.cluster_name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <a href={cov.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-secondary/40 transition-colors shrink-0 mt-0.5">
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Unified vs Specific Engines Tab panel */}
              <div className="rounded-2xl border border-border/15 bg-card/60 backdrop-blur-md p-4 space-y-3.5 shadow-sm bg-gradient-to-br from-card to-secondary/15">
                <div className="flex items-center justify-between border-b border-border/15 pb-2">
                  <h3 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                    <Compass className="h-3.5 w-3.5 text-accent animate-pulse" />
                    Multi-LLM GEO Suggestion Engines
                  </h3>

                  <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-lg text-[9px] font-bold">
                    <button
                      onClick={() => setActiveEngineTab("unified")}
                      className={`px-2 py-0.5 rounded-md transition-colors duration-200 ${activeEngineTab === "unified" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Unified Roadmap
                    </button>
                    <button
                      onClick={() => setActiveEngineTab("perplexity")}
                      className={`px-2 py-0.5 rounded-md transition-colors duration-200 ${activeEngineTab === "perplexity" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Perplexity
                    </button>
                    <button
                      onClick={() => setActiveEngineTab("gemini")}
                      className={`px-2 py-0.5 rounded-md transition-colors duration-200 ${activeEngineTab === "gemini" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Gemini
                    </button>
                    <button
                      onClick={() => setActiveEngineTab("chatgpt")}
                      className={`px-2 py-0.5 rounded-md transition-colors duration-200 ${activeEngineTab === "chatgpt" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      ChatGPT
                    </button>
                    <button
                      onClick={() => setActiveEngineTab("claude")}
                      className={`px-2 py-0.5 rounded-md transition-colors duration-200 ${activeEngineTab === "claude" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Claude
                    </button>
                  </div>
                </div>

                {/* Suggestions List grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                  {details.suggestions
                    .filter(s => activeEngineTab === "unified" || s.source === activeEngineTab)
                    .map((s, idx) => (
                      <div
                        key={s.id || idx}
                        className="p-3.5 rounded-xl border border-border/15 bg-gradient-to-br from-card/60 to-accent/[0.02] backdrop-blur-md shadow-sm hover:border-accent/25 hover:shadow-md transition-all duration-300 flex items-start gap-3 text-xs"
                      >
                        <span className={`flex items-center justify-center py-0.5 px-1.5 rounded text-[8px] font-extrabold uppercase shrink-0 tracking-wider ${
                          s.source === "perplexity"
                            ? "bg-teal-500/10 text-teal-500 border border-teal-500/20"
                            : s.source === "gemini"
                            ? "bg-purple-500/10 text-purple-500 border border-purple-500/20"
                            : s.source === "chatgpt"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                        }`}>
                          {s.source}
                        </span>
                        <div className="space-y-1.5 flex-1 min-w-0 font-medium">
                          <p className="font-bold text-foreground leading-snug text-xs">{s.topic_title}</p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                            Angle: "{s.suggested_angle}"
                          </p>
                          {s.priority && (
                            <Badge variant="outline" className={`text-[8px] tracking-widest py-0.5 font-black uppercase rounded ${
                              s.priority === "high"
                                ? "text-destructive border-destructive/20 bg-destructive/[0.02]"
                                : s.priority === "medium"
                                ? "text-amber-500 border-amber-500/20 bg-amber-500/[0.02]"
                                : "text-muted-foreground border-border bg-muted/[0.02]"
                            }`}>
                              {s.priority} Priority
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  {details.suggestions.filter(s => activeEngineTab === "unified" || s.source === activeEngineTab).length === 0 && (
                    <p className="col-span-2 text-[11px] text-muted-foreground italic text-center py-6">
                      No search suggestions parsed for this engine tab yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Direct GEO Blog Brief Generator Modal */}
      {briefModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-border/80 shadow-2xl overflow-hidden bg-card/95 backdrop-blur-md">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/80 px-5 py-3.5 bg-secondary/35 backdrop-blur-md">
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <FileText className="h-4 w-4 text-accent animate-pulse" />
                  GEO Blog Content Brief
                </h3>
                <p className="text-[10px] text-muted-foreground/80 font-bold truncate max-w-xl">
                  Outline target: {briefTitle}
                </p>
              </div>
              <button
                onClick={() => setBriefModalOpen(false)}
                className="p-1 rounded hover:bg-secondary/30 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 text-xs scrollbar-thin">
              {briefGenerating && (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <Loader2 className="h-7 w-7 animate-spin text-accent" />
                  <p className="text-[11px] text-muted-foreground font-semibold">Evaluating intent & drafting structural outline...</p>
                </div>
              )}

              {!briefGenerating && activeBrief && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed space-y-3 whitespace-pre-wrap font-mono p-5 rounded-xl border border-border/15 bg-background/55 max-h-[50vh] overflow-y-auto shadow-inner">
                  {activeBrief}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border/80 px-5 py-3.5 bg-secondary/20">
              <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold h-8" onClick={() => setBriefModalOpen(false)}>
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(activeBrief)
                  alert("GEO Brief copied to clipboard!")
                }}
                disabled={briefGenerating || !activeBrief}
                className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-accent/5 transition-all duration-300 hover:scale-[1.02]"
              >
                Copy Brief
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
