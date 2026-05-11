import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { getSettings, getKnowledgeBase, buildSystemPrompt } from "@/lib/settings"
import { generatePosts, resolveProvider, AIProvider } from "@/lib/ai"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { DigestResult, WebFinding, PainPoint, HarveyRelevancePoint } from "@/lib/types"

function getWeekRange(weekStart?: string | null): { start: Date; end: Date; label: string } {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  if (weekStart) {
    const start = new Date(weekStart)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    end.setHours(23, 59, 59, 999)
    return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
  }
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 7)
  start.setHours(0, 0, 0, 0)
  return { start, end: now, label: `${fmt(start)} – ${fmt(now)}` }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s
}

function inferPublication(url?: string | null): string {
  if (!url) return "Unknown"
  try {
    const host = new URL(url).hostname.replace("www.", "")
    const map: Record<string, string> = {
      "gartner.com": "Gartner", "forrester.com": "Forrester", "mckinsey.com": "McKinsey",
      "hbr.org": "Harvard Business Review", "wsj.com": "Wall Street Journal",
      "techcrunch.com": "TechCrunch", "venturebeat.com": "VentureBeat",
      "forbes.com": "Forbes", "bloomberg.com": "Bloomberg", "saastr.com": "SaaStr",
      "salesforce.com": "Salesforce Blog", "hubspot.com": "HubSpot",
      "reddit.com": "Reddit", "redd.it": "Reddit",
    }
    for (const [domain, name] of Object.entries(map)) {
      if (host.includes(domain)) return name
    }
    return host.split(".")[0].charAt(0).toUpperCase() + host.split(".")[0].slice(1)
  } catch {
    return "Unknown"
  }
}

// Tier classification for source credibility
function inferSourceTier(url?: string | null): "analyst" | "vendor" | "media" {
  if (!url) return "media"
  try {
    const host = new URL(url).hostname.replace("www.", "")
    const analystDomains = ["gartner.com", "forrester.com", "mckinsey.com", "hbr.org", "bcg.com", "bain.com", "deloitte.com", "accenture.com", "idc.com", "451research.com"]
    const vendorDomains = ["salesforce.com", "hubspot.com", "outreach.io", "salesloft.com", "apollo.io", "clay.com", "lemlist.com", "gong.io", "clari.com"]
    if (analystDomains.some(d => host.includes(d))) return "analyst"
    if (vendorDomains.some(d => host.includes(d))) return "vendor"
    return "media"
  } catch {
    return "media"
  }
}

function tierLabel(url?: string | null): string {
  const tier = inferSourceTier(url)
  if (tier === "analyst") return "[Analyst]"
  if (tier === "vendor") return "[Vendor Research]"
  return "[Media]"
}

const parseJson = (raw: string, fallback: object) => {
  if (!raw) return fallback
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return fallback
    const parsed = JSON.parse(match[0])
    return (parsed && Object.keys(parsed).length > 0) ? parsed : fallback
  } catch {
    return fallback
  }
}

export async function GET(req: NextRequest) {
  const rl = checkRateLimit(getRateLimitKey(req, "digest"), 3, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController, data: object) => {
    controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"))
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. Fetch trends for the requested week
        const weekStart = req.nextUrl.searchParams.get("weekStart")
        const { start, end, label: weekLabel } = getWeekRange(weekStart)
        
        // Widen start by 12 hours to handle timezone drifts between Local/Vercel
        const safeStart = new Date(start)
        safeStart.setHours(safeStart.getHours() - 12)

        console.log(`[Digest] Fetching trends from ${safeStart.toISOString()} to ${end.toISOString()} (Week: ${weekLabel})`)

        const { data: trends, error } = await supabase
          .from("trends")
          .select("*")
          .gte("found_at", safeStart.toISOString())
          .lte("found_at", end.toISOString())
          .order("found_at", { ascending: false })
          .limit(200)

        if (error) {
          console.error("[Digest] Supabase query error:", error)
          throw new Error("Failed to fetch trends: " + error.message)
        }

        const allTrends = trends ?? []
        // Sort web trends by relevanceScore descending for signal prioritization
        const webTrends = allTrends
          .filter((t) => t.source !== "Reddit")
          .sort((a, b) => (b.relevance_score ?? b.relevanceScore ?? 0) - (a.relevance_score ?? a.relevanceScore ?? 0))
        const redditTrends = allTrends.filter((t) => t.source === "Reddit")

        const totalComments = redditTrends.reduce((s, t) => s + (t.comments ?? 0), 0)
        const totalUpvotes = redditTrends.reduce((s, t) => s + (t.upvotes ?? 0), 0)

        send(controller, {
          type: "progress",
          stage: "fetching",
          message: `Found ${webTrends.length} web articles + ${redditTrends.length} Reddit posts`,
        })

        if (allTrends.length === 0) {
          send(controller, { type: "error", message: "No trends found for this period. Try a different week or refresh the dashboard first." })
          controller.close()
          return
        }

        // 2. Load Harvey context
        const [settings, knowledgeItems] = await Promise.all([getSettings(), getKnowledgeBase()])
        const provider = resolveProvider(settings?.ai_provider as AIProvider)
        const systemPrompt = settings ? await buildSystemPrompt(settings, knowledgeItems) : ""

        send(controller, { type: "progress", stage: "synthesizing", message: "Synthesizing web market signals…" })

        // 3. Build context strings with tier labels and velocity tags
        const webContext = webTrends
          .map((t) => {
            const tier = tierLabel(t.source_url)
            const vel = t.velocity === "hot" ? " [HOT]" : t.velocity === "rising" ? " [RISING]" : ""
            const pub = inferPublication(t.source_url)
            return `• ${tier}${vel} [${pub}] ${t.title}: ${truncate(t.summary ?? "", 250)}${t.source_url ? ` (${t.source_url})` : ""}`
          })
          .join("\n")

        // Extract subreddit from URL for reddit context
        const redditContext = redditTrends
          .map((t) => {
            const sub = t.source_url?.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? "reddit"
            const engagement = (t.upvotes ?? 0) * 2 + (t.comments ?? 0) * 3
            return `• r/${sub} | ↑${t.upvotes ?? 0} 💬${t.comments ?? 0} [score:${engagement}] — "${t.title}": ${truncate(t.summary ?? "", 250)}`
          })
          .join("\n")

        // 4. Three parallel AI calls — deep chain-of-thought prompts

        const webPrompt = `You are a senior B2B market analyst synthesizing ${webTrends.length} market signals for the week of ${weekLabel}.

Your audience: VP Sales, CRO, and RevOps leaders at B2B SaaS companies who need intelligence to adjust strategy, prioritize accounts, and stay competitive. They have 3 minutes to read this. Make every word count.

MARKET SIGNALS (format: [Tier] [Velocity] [Publication] Title: Summary | URL):
${webContext}

Source tiers: [Analyst] = Gartner/Forrester/McKinsey/HBR (highest credibility), [Vendor Research] = company-sponsored data, [Media] = trade press.
Velocity: [HOT] = fastest moving signal this week, [RISING] = accelerating.

ANALYSIS FRAMEWORK — for each key finding, apply "Signal → So What → Now What":
- Signal: What specifically happened or was reported (with the source and a concrete data point if available)
- So What: The strategic implication for B2B sales teams (one sharp sentence — not obvious, not generic)
- Now What: The specific action or attention point this week (verb-led, concrete)

Prioritize signals that reveal PATTERNS or STRATEGY SHIFTS. Deprioritize isolated vendor announcements with no broader signal.
Sort findings by impact: most critical to revenue leaders first.

Return ONLY valid JSON:
{
  "headline": "The single most important market insight this week (10-15 words, bold claim backed by data)",
  "marketMovement": "One sentence describing the overall direction the B2B sales + AI market is moving this week",
  "keyFindings": [
    {
      "signal": "What happened — specific, with company name or data point",
      "soWhat": "Why this matters strategically to B2B sales teams (1 sharp sentence)",
      "nowWhat": "Specific action or watch item this week (verb-led, 1 sentence)",
      "tier": "analyst|vendor|media",
      "velocity": "hot|rising|stable",
      "publication": "source publication name"
    }
  ],
  "trendingTopics": ["3-5 concise topic labels (2-4 words each) representing the dominant themes"],
  "notableStats": ["up to 6 precise statistics with source context — format: 'stat — source (context)'"],
  "marketRisks": ["2-3 specific risks or threats B2B sales teams should watch this week"],
  "sources": [{ "title": "article title", "url": "source url", "publication": "publication name", "tier": "analyst|vendor|media" }]
}

Aim for 5-8 key findings. Return ONLY the JSON object. No markdown, no explanation.`

        const redditPrompt = `You are a practitioner intelligence analyst studying ${redditTrends.length} Reddit posts from B2B sales communities for the week of ${weekLabel}.

Your job: Extract what real practitioners (sales reps, SDRs, AEs, RevOps professionals) actually think, struggle with, and debate — not vendor messaging.

REDDIT POSTS (format: r/subreddit | ↑upvotes 💬comments [engagement score] — title: summary):
${redditContext || "No Reddit posts found this week."}

Total community engagement: ${totalUpvotes} upvotes, ${totalComments} comments across ${redditTrends.length} posts.

SIGNAL/NOISE FILTER: Weight posts by engagement score (upvotes × 2 + comments × 3). Treat low-engagement posts (<10 score) as weak signal unless the topic is uniquely specific.
PRACTITIONER FILTER: Distinguish practitioner voices (reps, managers, RevOps) from vendor/affiliate content. Weight practitioner voices 3× higher.

For each pain point, find EVIDENCE: which discussion(s) support it, and quote or paraphrase a specific practitioner voice if possible.

Return ONLY valid JSON:
{
  "headline": "The dominant practitioner sentiment this week (10-15 words — what practitioners are ACTUALLY saying)",
  "overallSentiment": "positive|neutral|negative|mixed",
  "sentimentDriver": "One sentence explaining WHY practitioners feel this way this week (specific reason, not generic)",
  "communityPainPoints": [
    {
      "painPoint": "Specific pain point — concrete, not generic (e.g., 'AI-generated cold emails are getting 1% reply rates' not 'outreach is hard')",
      "evidence": "Which subreddit/discussion(s) support this",
      "practitionerQuote": "A representative quote or close paraphrase from a practitioner (if available)"
    }
  ],
  "subredditBreakdown": [
    {
      "name": "subreddit name without r/",
      "postCount": number,
      "dominantTheme": "what this community is focused on this week (1 sentence)"
    }
  ],
  "topDiscussions": [
    {
      "title": "post title (max 80 chars)",
      "upvotes": number,
      "comments": number,
      "url": "reddit url or empty string",
      "whyItMatters": "one sentence on why this discussion is significant"
    }
  ],
  "keyInsights": ["3-5 non-obvious insights you'd ONLY learn from practitioners — things absent from analyst reports"],
  "buyerSignals": ["2-3 signals about how B2B buyers are thinking or behaving differently this week"]
}

Include top 5 discussions by engagement. Return ONLY the JSON object. No markdown, no explanation.`

        const harveyPrompt = `You are a competitive strategy advisor writing a market intelligence brief for Harvey, an AI copilot for B2B sales.

Harvey's value proposition: Closes the full B2B sales loop — prospecting, personalized outreach, follow-up sequences, and pipeline management — in one AI-native platform.
Harvey's direct competitors: Salesloft, Apollo, Clay, Lemlist.

THIS WEEK'S MARKET INTELLIGENCE:

Web market headline: ${webTrends.slice(0, 1).map((t) => t.title).join("")}
Market movement: (synthesized from ${webTrends.length} signals)
Top market signals:
${webTrends.slice(0, 6).map((t) => `• [${inferSourceTier(t.source_url)}] ${t.title}: ${truncate(t.summary ?? "", 150)}`).join("\n")}

Community intelligence:
• ${redditTrends.length} Reddit posts from B2B sales communities
• Community engagement: ${totalUpvotes} upvotes, ${totalComments} comments
• Top discussions: ${redditTrends.slice(0, 3).map((t) => t.title).join("; ")}

Your task: Provide a strategic brief explaining Harvey's competitive position relative to this week's market movements. Be SPECIFIC — connect actual findings to Harvey's actual capabilities. Avoid generic "Harvey helps sales teams" language.

Return ONLY valid JSON:
{
  "headline": "Harvey's strategic position this week (10-15 words — confident, specific, grounded in the week's findings)",
  "marketOpportunity": "The single biggest opportunity for Harvey this week based on specific market movements",
  "competitiveContext": "How the competitive landscape shifted this week — specific competitor moves or market positioning changes (or note if no major shifts detected)",
  "relevancePoints": [
    {
      "finding": "The specific market signal or practitioner pain point",
      "harveyAdvantage": "Why Harvey is specifically positioned to win here — concrete, not generic",
      "urgency": "high|medium|low",
      "talkingPoint": "A one-line message Harvey reps should use in outreach or demos this week"
    }
  ],
  "winConditions": ["2-3 specific account or deal scenarios where Harvey wins decisively this week"],
  "threatSignals": ["1-2 competitive threats or market moves Harvey should monitor"],
  "callToAction": "One compelling sentence for B2B sales leaders evaluating AI sales tools this week"
}

Aim for 4-6 relevance points. Return ONLY the JSON object. No markdown, no explanation.`

        const [webRaw, redditRaw, harveyRaw] = await Promise.all([
          generatePosts(systemPrompt, webPrompt, provider).catch(() => ""),
          generatePosts(systemPrompt, redditPrompt, provider).catch(() => ""),
          generatePosts(systemPrompt, harveyPrompt, provider).catch(() => ""),
        ])

        send(controller, { type: "progress", stage: "reddit", message: "Analyzing community intelligence…" })

        // Parse AI results with typed fallbacks
        const webSynthesisFallback = {
          headline: "AI is reshaping B2B sales this week",
          marketMovement: "The market is consolidating around AI-native workflows for B2B sales teams.",
          keyFindings: webTrends.slice(0, 6).map((t) => ({
            signal: t.title,
            soWhat: truncate(t.summary ?? "Market shift in progress.", 120),
            nowWhat: "Monitor this development and assess impact on your pipeline.",
            tier: inferSourceTier(t.source_url),
            velocity: t.velocity ?? "stable",
            publication: inferPublication(t.source_url),
          })) as WebFinding[],
          trendingTopics: ["AI Sales", "B2B Outreach", "Pipeline AI"],
          notableStats: [],
          marketRisks: ["Rapid AI adoption compressing competitive differentiation windows."],
          sources: webTrends.slice(0, 8).filter((t) => t.source_url).map((t) => ({
            title: t.title,
            url: t.source_url,
            publication: inferPublication(t.source_url),
            tier: inferSourceTier(t.source_url),
          })),
        }

        const redditFallback = {
          headline: "Practitioners are debating AI adoption effectiveness in B2B sales",
          overallSentiment: "mixed",
          sentimentDriver: "Sales practitioners see AI potential but struggle with implementation quality and trust.",
          communityPainPoints: redditTrends.slice(0, 5).map((t) => ({
            painPoint: t.title,
            evidence: `r/${t.source_url?.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? "sales"} discussion`,
            practitionerQuote: truncate(t.summary ?? "", 100),
          })) as PainPoint[],
          subredditBreakdown: [],
          topDiscussions: redditTrends.slice(0, 5).map((t) => ({
            title: t.title,
            upvotes: t.upvotes ?? 0,
            comments: t.comments ?? 0,
            url: t.source_url ?? "",
            whyItMatters: "High community engagement signals this is a live practitioner concern.",
          })),
          sentiment: "mixed" as const,
          keyInsights: [],
          buyerSignals: [],
        }

        const harveyFallback = {
          headline: "Harvey addresses this week's biggest B2B sales intelligence gaps",
          marketOpportunity: "AI adoption gap between early movers and laggards creates a prime window for Harvey's full-loop approach.",
          competitiveContext: "No major competitor shifts detected this week — market positioning stable.",
          relevancePoints: [
            {
              finding: "Practitioners struggling with AI-generated outreach quality and reply rates",
              harveyAdvantage: "Harvey's full-loop approach means outreach is informed by pipeline context, not isolated prompts",
              urgency: "high" as const,
              talkingPoint: "Unlike point solutions, Harvey connects every outreach to live pipeline data for contextual personalization.",
            },
          ],
          winConditions: ["Accounts evaluating multiple point solutions (Apollo + Lemlist + CRM) — Harvey replaces the stack"],
          threatSignals: ["Incumbent CRM vendors adding AI features to existing deals"],
          callToAction: "See how Harvey closes the full B2B sales loop where fragmented tools fall short.",
        }

        const webSynthesis = parseJson(webRaw, webSynthesisFallback)
        const redditPulse = parseJson(redditRaw, redditFallback)
        const harveyAngle = parseJson(harveyRaw, harveyFallback)

        send(controller, { type: "progress", stage: "harvey", message: "Building strategic implications…" })

        // 5. Sequential executive synthesis call
        send(controller, { type: "progress", stage: "executive", message: "Writing executive summary…" })

        const execPrompt = `You are writing an executive summary for a B2B sales market intelligence report covering the week of ${weekLabel}.

Your audience: CRO, VP Sales, and RevOps leaders. They have 60 seconds. Make it count.

DATA FROM THIS WEEK:

WEB MARKET INTELLIGENCE:
Headline: ${webSynthesis.headline}
Market movement: ${webSynthesis.marketMovement ?? ""}
Top findings:
${(webSynthesis.keyFindings ?? []).slice(0, 4).map((f: WebFinding | string) =>
  typeof f === "string" ? f : `• ${f.signal} → ${f.soWhat} → ${f.nowWhat}`
).join("\n")}
Market risks: ${(webSynthesis.marketRisks ?? []).join("; ")}

COMMUNITY INTELLIGENCE:
Headline: ${redditPulse.headline}
Practitioner sentiment: ${redditPulse.overallSentiment ?? redditPulse.sentiment} — ${redditPulse.sentimentDriver ?? ""}
Top pain points: ${(redditPulse.communityPainPoints ?? []).slice(0, 3).map((p: PainPoint | string) =>
  typeof p === "string" ? p : p.painPoint
).join("; ")}
Buyer signals: ${(redditPulse.buyerSignals ?? []).join("; ")}

STRATEGIC IMPLICATIONS:
Harvey headline: ${harveyAngle.headline}
Market opportunity: ${harveyAngle.marketOpportunity ?? ""}
Top win conditions: ${(harveyAngle.winConditions ?? []).join("; ")}

Apply the MECE principle (mutually exclusive, collectively exhaustive). Lead with the single most important insight. Close with the single most important action.
Prioritize findings by revenue impact. Be specific — no generic observations.

Return ONLY valid JSON:
{
  "headline": "The single most important market insight this week (12-16 words — bold, specific claim)",
  "executiveOverview": "2-3 sentences a CRO reads in 30 seconds. What happened, why it matters, what to do. No fluff.",
  "criticalFindings": [
    {
      "finding": "Concise statement of finding (1 sentence, specific)",
      "implication": "Revenue/strategic implication for B2B sales leaders (1 sentence, concrete)"
    }
  ],
  "marketOutlook": "Where the B2B sales + AI market is heading in the next 30-60 days (2-3 sentences, forward-looking)",
  "topRecommendation": "The single most important action for B2B sales leaders this week (verb-led, specific)",
  "recommendations": [
    {
      "action": "Specific action (verb-led, concrete)",
      "rationale": "Why this matters now (1 sentence)",
      "timeframe": "this week|this month|this quarter",
      "priority": "critical|high|medium"
    }
  ],
  "signalStrength": "strong|moderate|weak",
  "signalStrengthReason": "One sentence on why the signal is strong/moderate/weak this week (based on data volume and quality)"
}

Aim for exactly 3 critical findings and 3-4 recommendations. Return ONLY the JSON object. No markdown.`

        const execRaw = await generatePosts(systemPrompt, execPrompt, provider).catch(() => "")

        const execFallback = {
          headline: `${webSynthesis.headline}`,
          executiveOverview: `${webSynthesis.marketMovement ?? "The B2B sales AI market continues to evolve rapidly this week."} Practitioners show ${redditPulse.overallSentiment ?? redditPulse.sentiment} sentiment around adoption. ${harveyAngle.marketOpportunity ?? "Key opportunities exist for AI-native platforms."}`,
          criticalFindings: [
            {
              finding: webSynthesis.headline,
              implication: "B2B sales teams that delay AI integration risk falling behind in pipeline velocity.",
            },
            {
              finding: redditPulse.headline,
              implication: "Practitioner friction signals an adoption gap that informed vendors can exploit.",
            },
            {
              finding: harveyAngle.headline,
              implication: harveyAngle.marketOpportunity ?? "The window for AI sales platform differentiation remains open.",
            },
          ],
          marketOutlook: "AI-native sales tools are moving from novelty to competitive necessity. Teams adopting full-loop AI platforms this quarter will see measurable pipeline advantages within 60-90 days.",
          topRecommendation: "Audit your current AI sales stack for gaps and evaluate full-loop alternatives before Q3 planning cycles lock in.",
          recommendations: [
            { action: "Review AI tool adoption rates across your team", rationale: "Practitioner resistance is early signal of stack fit issues", timeframe: "this week" as const, priority: "critical" as const },
            { action: "Identify accounts showing buying committee expansion signals", rationale: webSynthesis.headline, timeframe: "this week" as const, priority: "high" as const },
            { action: "Update competitive battlecards with this week's market movements", rationale: "Competitive context shifts require messaging updates", timeframe: "this month" as const, priority: "medium" as const },
          ],
          signalStrength: webTrends.length > 10 ? "strong" : webTrends.length > 4 ? "moderate" : "weak" as "strong" | "moderate" | "weak",
          signalStrengthReason: `Based on ${webTrends.length} web signals and ${redditTrends.length} community discussions this week.`,
        }

        const executiveSummary = parseJson(execRaw, execFallback)

        const digest: DigestResult = {
          weekRange: weekLabel,
          generatedAt: new Date().toISOString(),
          webCount: webTrends.length,
          redditCount: redditTrends.length,
          totalComments,
          totalUpvotes,
          executiveSummary,
          webSynthesis,
          redditPulse,
          harveyAngle,
        }

        // Save to Supabase (best-effort)
        let digestId: string | null = null
        try {
          const { data: saved } = await supabase
            .from("digests")
            .insert({
              week_range: digest.weekRange,
              generated_at: digest.generatedAt,
              web_count: digest.webCount,
              reddit_count: digest.redditCount,
              headline: digest.executiveSummary.headline,
              digest_json: digest,
            })
            .select("id")
            .single()
          digestId = saved?.id ?? null
        } catch {
          // table may not exist yet — silently skip
        }

        send(controller, { type: "complete", digest, digestId })
        controller.close()
      } catch (err) {
        console.error("Digest API error:", err)
        send(controller, { type: "error", message: "Digest generation failed. Please try again." })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" },
  })
}
