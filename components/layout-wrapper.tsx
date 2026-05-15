"use client"

import { useState, useEffect, createContext, useContext } from "react"
import { cn } from "@/lib/utils"
import { Sidebar } from "./sidebar"

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
})

export function useSidebarState() {
  return useContext(SidebarContext)
}

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed")
    if (stored !== null) {
      setCollapsed(stored === "true")
    }
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("sidebar-collapsed", String(collapsed))
    }
  }, [collapsed, mounted])

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main
          className={cn(
            "transition-all duration-200",
            // On mobile: no left padding (sidebar is overlay)
            // On desktop: pad based on collapsed state
            mounted
              ? collapsed
                ? "pl-0 lg:pl-[60px]"
                : "pl-0 lg:pl-[240px]"
              : "pl-0 lg:pl-[240px]"
          )}
        >
          <div className="max-w-7xl mx-auto px-8 py-6 pt-16 lg:pt-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarContext.Provider>
  )
}
