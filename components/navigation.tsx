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
    <header className="sticky top-0 z-50 border-b border-sidebar-border bg-sidebar">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex h-12 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md bg-sidebar-primary flex items-center justify-center">
              <span className="text-xs font-bold text-sidebar-primary-foreground">H</span>
            </div>
            <span className="text-sm font-semibold text-sidebar-foreground tracking-tight">Harvey</span>
          </Link>
          <div className="flex items-center gap-1">
            <nav className="flex items-center">
              {navItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
            <div className="ml-2 pl-2 border-l border-sidebar-border/50">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
