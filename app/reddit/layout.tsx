"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { PenLine, Terminal, Library, Radio } from "lucide-react"

const redditNavItems = [
  { href: "/reddit/generate", label: "Generate Post", icon: PenLine },
  { href: "/reddit/command-centre", label: "Command Centre", icon: Terminal },
  { href: "/reddit/engagement", label: "Engagement Library", icon: Library },
  { href: "/reddit/monitors", label: "Feed Monitors", icon: Radio },
]

export default function RedditLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sub-navigation tabs — subtle style */}
      <div className="border-b border-border/50">
        <nav className="flex items-center gap-0 -mb-px">
          {redditNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-xs font-medium border-b-2 transition-all duration-200",
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="animate-slide-up">{children}</div>
    </div>
  )
}
