import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"

export const maxDuration = 60

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

let _anthropic: Anthropic | null = null
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

let _groq: OpenAI | null = null
function getGroq() {
  if (!_groq) {
    _groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1"
    })
  }
  return _groq
}

let _openrouter: OpenAI | null = null
function getOpenRouter() {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/EnactOn/findquestions",
        "X-Title": "Find Questions Engine"
      }
    })
  }
  return _openrouter
}

interface LLMOptions {
  systemPrompt?: string
  userPrompt: string
  model: string
  jsonMode: boolean
}

async function callLLM(options: LLMOptions): Promise<string> {
  const { systemPrompt, userPrompt, model, jsonMode } = options

  const isOpenRouter = model.includes("/")
  const isGroq = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"].includes(model)
  const isAnthropic = ["claude-3-5-sonnet", "claude-3-5-haiku"].includes(model)

  if (isOpenRouter) {
    const openrouter = getOpenRouter()
    const response = await openrouter.chat.completions.create({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: userPrompt }
      ]
    })
    return response.choices[0]?.message?.content ?? ""
  }

  if (isGroq) {
    const groq = getGroq()
    const response = await groq.chat.completions.create({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: userPrompt }
      ]
    })
    return response.choices[0]?.message?.content ?? ""
  }

  if (isAnthropic) {
    const anthropic = getAnthropic()
    const anthropicModel = model === "claude-3-5-sonnet" ? "claude-3-5-sonnet-20241022" : "claude-3-5-haiku-20241022"
    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userPrompt }]
    })
    return response.content[0].type === "text" ? response.content[0].text : ""
  }

  // Default: OpenAI
  const openai = getOpenAI()
  const openaiModel = model === "gpt-4o-mini" ? "gpt-4o-mini" : "gpt-4o"
  const response = await openai.chat.completions.create({
    model: openaiModel,
    messages: [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user" as const, content: userPrompt }
    ]
  })
  return response.choices[0]?.message?.content ?? ""
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { question, geoStrategy, model = "gpt-4o", persona = "", icp = "" } = body

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 })
    }

    console.log(`\n[STEP 4.5] GENERATE POST FOR QUESTION: ${question}`)
    console.log(`  ├─ Model        : ${model}`)
    console.log(`  └─ GEO Strategy : ${geoStrategy}`)

    const userPrompt = `You are a high-end technical writer, SEO expert, and content strategist for our brand.
Our Brand Persona Profile: "${persona}"
Our Target Customer (ICP): "${icp}"

Write a comprehensive, premium, and highly authoritative blog/LinkedIn article draft directly addressing this target search question:
"${question}"

Your content MUST be structurally optimized for Generative Engine Optimization (GEO) using this exact strategy:
"${geoStrategy}"

Your generated post MUST strictly adhere to these elite GEO rules:
1. **Direct Definition Hook**: Start the very first paragraph (first 120-150 characters) with a bold, direct, and authoritative 2-3 sentence answer resolving the question immediately (no preamble like "In this post..." or "As an AI...").
2. **Dense Technical Vocabulary**: Incorporate highly specific, professional industry-specific jargon and technical terminology (e.g. precise protocol names, SDK hooks, security standards, databases connection layers) matching our persona and ICP. Do NOT speak in generalities or high-level marketing fluff.
3. **Structured Format**: Use clean, logical markdown subheadings (H2/H3), bullet points, or lists. If the question implies comparisons, options, or costs, you MUST embed a cleanly structured markdown table comparing them.
4. **Authoritative & Citeable**: Write with high-end, expert tone. Avoid passive voice, empty adjectives, and overly academic phrasing. Make every sentence highly descriptive, informative, and packed with concrete facts.
5. **No Self-Referential Meta-Text**: Do NOT mention terms like "Generative Engine Optimization", "GEO", "GEO-optimized", "audits mapping", or talk about SEO/GEO strategy inside the reader-facing article. The optimization must be entirely structural and natural to the reader, maintaining a flawless B2B client-facing tone.

Generate ONLY the markdown article content itself. No explanations, no markdown fences around the entire block (except standard H2/H3 headings), no preamble.`

    const postContent = await callLLM({
      userPrompt,
      model,
      jsonMode: false
    })

    return NextResponse.json({ post: postContent.trim() })

  } catch (error: any) {
    console.error("[GENERATE POST ERROR]:", error?.message || error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
