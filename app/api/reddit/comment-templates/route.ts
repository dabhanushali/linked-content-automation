import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-comment-templates")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const { data, error } = await supabase
    .from("reddit_comment_templates")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: "Failed to load comment templates" }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const rlKey = getRateLimitKey(req, "reddit-comment-templates")
  const { allowed, retryAfterSeconds } = checkRateLimit(rlKey, 30, 60000)
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    )
  }

  const body = await req.json()
  const { name, template_text } = body

  if (!name || !template_text) {
    return NextResponse.json({ error: "Name and template_text are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("reddit_comment_templates")
    .insert({
      name: name.trim(),
      template_text: template_text.trim(),
    })
    .select()
    .single()

  if (error) {
    console.error("Comment template create error:", error)
    return NextResponse.json({ error: "Failed to create comment template" }, { status: 500 })
  }

  return NextResponse.json(data)
}
