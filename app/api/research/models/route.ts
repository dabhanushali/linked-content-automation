import { NextResponse } from "next/server"

export const maxDuration = 10 // Allow up to 10s for dynamic endpoint lookups

interface ModelOption {
  id: string
  name: string
}

export async function GET() {
  // Curated fallback defaults in case of network timeouts or missing keys
  let groqModels: ModelOption[] = [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70b" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8b" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7b" }
  ]

  let openRouterModels: ModelOption[] = [
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Chat)" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70b" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" }
  ]

  // 1. Fetch dynamic Groq Models (Securely using server-side API key)
  try {
    if (process.env.GROQ_API_KEY) {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(5000)
      })
      if (res.ok) {
        const json = await res.json()
        const list = json.data || []
        if (list.length > 0) {
          groqModels = list
            .map((m: any) => {
              // Convert kebab-case (e.g. llama-3.3-70b-versatile) to Title Case (Llama 3.3 70b Versatile)
              const formattedName = m.id
                .replace(/-/g, " ")
                .split(" ")
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
              return { id: m.id, name: formattedName }
            })
            .sort((a: any, b: any) => a.name.localeCompare(b.name))
        }
      }
    }
  } catch (err) {
    console.error("Failed to load Groq models dynamically on server:", err)
  }

  // 2. Fetch dynamic OpenRouter Models
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(5000)
    })
    if (res.ok) {
      const json = await res.json()
      const list = json.data || []
      if (list.length > 0) {
        openRouterModels = list
          .map((m: any) => ({
            id: m.id,
            name: m.name || m.id
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name))
      }
    }
  } catch (err) {
    console.error("Failed to load OpenRouter models dynamically on server:", err)
  }

  return NextResponse.json({
    groq: groqModels,
    openrouter: openRouterModels
  })
}
