import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 30 req/min for CRUD
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-engagement"), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { id } = await params
    const body = await req.json()
    const { tags, note } = body

    const updates: Record<string, unknown> = {}
    if (tags !== undefined) {
      updates.tags = Array.isArray(tags) ? tags : []
    }
    if (note !== undefined) {
      updates.note = note
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update (tags, note)" },
        { status: 400 }
      )
    }

    const { data: item, error } = await supabase
      .from("engagement_library")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: "Failed to update engagement item" },
        { status: 500 }
      )
    }

    if (!item) {
      return NextResponse.json(
        { error: "Engagement item not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ item })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 30 req/min for CRUD
  const rl = checkRateLimit(getRateLimitKey(req, "reddit-engagement"), 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  try {
    const { id } = await params

    const { error } = await supabase
      .from("engagement_library")
      .delete()
      .eq("id", id)

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete engagement item" },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: "Engagement item deleted" })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
