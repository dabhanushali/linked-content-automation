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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-md bg-sidebar text-sidebar-foreground"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
      >
        <ChevronsRight className="h-4 w-4" />
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen bg-sidebar flex flex-col transition-all duration-200",
          collapsed ? "w-[60px]" : "w-[240px]",
          "lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Top: Logo + collapse toggle */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-sidebar-border shrink-0">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-7 w-7 rounded-md bg-sidebar-primary flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-sidebar-primary-foreground">H</span>
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-sidebar-foreground tracking-tight whitespace-nowrap">
                Harvey
              </span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center h-7 w-7 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors duration-150"
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
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                  collapsed && "justify-center px-2",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}

          {/* History section */}
          {!collapsed && (
            <div className="pt-4 mt-4 border-t border-sidebar-border">
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Past monitors
              </p>
              <div className="space-y-0.5">
                {pastMonitors.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-colors duration-150 cursor-pointer"
                  >
                    <Radio className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Bottom: Theme toggle + user */}
        <div className="shrink-0 border-t border-sidebar-border px-2 py-3">
          <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-2")}>
            <ThemeToggle />
            {!collapsed && (
              <div className="h-7 w-7 rounded-full bg-sidebar-accent flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-sidebar-foreground" />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
