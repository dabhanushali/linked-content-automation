"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { TrendCard } from "@/components/trend-card"
import { TrendCardSkeleton } from "@/components/trend-card-skeleton"
import { Trend } from "@/lib/types"
import { RefreshCw } from "lucide-react"
import { toast } from "@/hooks/use-toast"

export default function DashboardPage() {
  const [trends, setTrends] = useState<Trend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>("All")

  const fetchTrends = useCallback(async (force = false) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/trends${force ? "?force=true" : ""}`)
      if (!res.ok) throw new Error("Failed to fetch trends")
      const data = await res.json()
      if (data.trends) setTrends(data.trends)
    } catch {
      toast({
        title: "Failed to load trends",
        description: "Check your API key and try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrends()
  }, [fetchTrends])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-slide-up">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">
            {"What's trending in AI Sales right now"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discover hot topics and generate on-brand LinkedIn posts and Reddit comments
          </p>
        </div>
        <Button
          onClick={() => fetchTrends(true)}
          disabled={isLoading}
          variant="outline"
          className="shrink-0 h-9 hover:bg-muted/50 transition-all duration-150"
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Trends
        </Button>
      </div>

      {!isLoading && trends.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {["All", "Web Search", "Reddit"].map((f) => {
            const count = f === "All" ? trends.length : f === "Web Search" ? trends.filter((t) => t.source !== "Reddit").length : trends.filter((t) => t.source === "Reddit").length
            if (f !== "All" && count === 0) return null
            return (
              <button
                key={f}
                onClick={() => setSourceFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors duration-150 ${
                  sourceFilter === f
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-transparent text-muted-foreground border-border hover:bg-muted/50 hover:border-muted-foreground"
                }`}
              >
                {f} {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-slide-up">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <TrendCardSkeleton key={i} />)
          : (sourceFilter === "All" ? trends : sourceFilter === "Web Search" ? trends.filter((t) => t.source !== "Reddit") : trends.filter((t) => t.source === "Reddit")).map((trend) => (
              <TrendCard key={trend.id} trend={trend} />
            ))}
      </div>
    </div>
  )
}
