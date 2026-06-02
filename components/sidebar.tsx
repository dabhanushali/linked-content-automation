"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  PenLine,
  Search,
  MessageSquare,
  Hash,
  History,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Radio,
  User,
} from "lucide-react"
import { ThemeToggle } from "./theme-toggle"
import { useSidebarState } from "./layout-wrapper"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/generate", label: "Generate", icon: PenLine },
  { href: "/research", label: "Research", icon: Search },
  { href: "/comments", label: "Comments", icon: MessageSquare },
  { href: "/reddit", label: "Reddit", icon: Hash },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
]

const pastMonitors = [
  { label: "r/marketing — SEO tools", id: "1" },
  { label: "r/SaaS — pricing strategy", id: "2" },
  { label: "r/startups — MVP feedback", id: "3" },
  { label: "r/sales — cold outreach", id: "4" },
]

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed, setCollapsed } = useSidebarState()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-all duration-300"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-xl bg-card/80 border border-border/15 backdrop-blur-md text-foreground shadow-md transition-all duration-300 hover:scale-[1.05]"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
      >
        <ChevronsRight className="h-4 w-4 text-accent" />
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen bg-card/75 backdrop-blur-xl border-r border-border/15 shadow-[1px_0_20px_-10px_rgba(0,0,0,0.05)] flex flex-col transition-all duration-300 ease-in-out",
          collapsed ? "w-[60px]" : "w-[240px]",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Top: Logo + collapse toggle */}
        <div className="flex items-center justify-between h-14 px-3.5 border-b border-border/10 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden group select-none">
            {/* Beautiful Gradient Icon Box */}
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-accent to-accent/60 shadow-lg shadow-accent/15 flex items-center justify-center shrink-0 relative overflow-hidden transition-transform duration-300 group-hover:scale-105">
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="text-[11px] font-black text-accent-foreground tracking-wider uppercase">H</span>
            </div>
            {!collapsed && (
              <span className="text-xs font-black tracking-widest bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground/80 bg-clip-text text-transparent uppercase whitespace-nowrap">
                Harvey
              </span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-secondary/20 border border-border/10 shadow-sm transition-all duration-300"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Middle: Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-300 group relative border border-transparent select-none",
                  collapsed && "justify-center px-0 h-10 w-10 mx-auto",
                  isActive
                    ? "bg-accent/15 text-accent border border-accent/15 shadow-sm shadow-accent/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/35"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}

          {/* History section */}
          {!collapsed && (
            <div className="pt-4 mt-4 border-t border-border/10">
              <p className="px-3.5 mb-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                Past monitors
              </p>
              <div className="space-y-1">
                {pastMonitors.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-[11px] font-medium text-muted-foreground/80 hover:text-foreground hover:bg-secondary/25 border border-transparent hover:border-border/5 transition-all duration-300 cursor-pointer group"
                  >
                    <Radio className="h-3 w-3 text-accent/60 group-hover:text-accent transition-colors shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Bottom: Theme toggle + user */}
        <div className="shrink-0 border-t border-border/10 px-3.5 py-4 bg-secondary/15 backdrop-blur-md">
          <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-1")}>
            <ThemeToggle />
            {!collapsed && (
              <div className="h-8.5 w-8.5 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shadow-inner hover:bg-accent/15 transition-all duration-300 cursor-pointer relative overflow-hidden group">
                <User className="h-4 w-4 text-accent group-hover:scale-110 transition-transform duration-300" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
