"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, PenLine, History, Settings, Search, MessageSquare, Hash } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Generate", icon: PenLine },
  { href: "/research", label: "Research", icon: Search },
  { href: "/comments", label: "Comments", icon: MessageSquare },
  { href: "/reddit", label: "Reddit", icon: Hash },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-border/15 bg-card/75 backdrop-blur-xl shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group select-none">
            <div className="h-7 w-7 rounded-xl bg-gradient-to-tr from-accent to-accent/60 shadow-md shadow-accent/10 flex items-center justify-center relative overflow-hidden transition-transform duration-300 group-hover:scale-105">
              <span className="text-[10px] font-black text-accent-foreground">H</span>
            </div>
            <span className="text-xs font-black tracking-widest bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground/80 bg-clip-text text-transparent uppercase whitespace-nowrap">
              Harvey
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-300 relative border border-transparent select-none",
                      isActive
                        ? "bg-accent/10 text-accent border-accent/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/35"
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
            <div className="ml-2 pl-2 border-l border-border/15">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
