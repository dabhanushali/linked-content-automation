"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { PenLine, Terminal, Library, Radio, MessageSquare, Compass, HelpCircle } from "lucide-react"

const redditNavItems = [
  { href: "/reddit/generate", label: "Generate Post", icon: PenLine },
  { href: "/reddit/command-centre", label: "Command Centre", icon: Terminal },
  { href: "/reddit/geo", label: "GEO Engine", icon: Compass },
  { href: "/reddit/questions", label: "Find Questions", icon: HelpCircle },
  { href: "/reddit/engagement", label: "Engagement Library", icon: Library },
  { href: "/reddit/monitors", label: "Feed Monitors", icon: Radio },
  { href: "/reddit/comments", label: "Comments", icon: MessageSquare },
]

export default function RedditLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-8 min-h-screen pb-16 animate-fade-in">
      {/* Sticky frosted glass workspace header */}
      <div className="sticky top-0 z-50 py-3.5 backdrop-blur-md bg-background/35 border-b border-border/15 shadow-[0_2px_20px_-10px_rgba(0,0,0,0.05)] transition-all">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between gap-4 flex-wrap">
          {/* Active Workspace Label */}
          <div className="flex items-center gap-2 select-none">
            <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground/80">
              Reddit Workspace
            </span>
          </div>

          {/* Premium Capsule Tabs */}
          <nav className="flex items-center gap-0.5 bg-secondary/15 p-0.5 border border-border/20 rounded-xl">
            {redditNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 relative group select-none",
                    isActive
                      ? "bg-accent/10 text-accent border border-accent/20 scale-[1.02] shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/35"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 transition-transform duration-300 group-hover:scale-110" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 animate-slide-up">
        {children}
      </main>
    </div>
  )
}
