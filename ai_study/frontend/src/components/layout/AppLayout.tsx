"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavItem {
  icon: React.ReactNode
  label: string
  href: string
}

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState<{ login: string; avatar_url?: string } | null>(null)

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch { /* ignore */ }
    }
  }, [])

  const navItems: NavItem[] = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      label: "AI 助手",
      href: "/chat",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
      ),
      label: "任务看板",
      href: "/kanban",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
      ),
      label: "产物交付",
      href: "/delivery",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M2 12h2M20 12h2"/>
        </svg>
      ),
      label: "模型设置",
      href: "/setup",
    },
  ]

  const isActive = (href: string) => {
    if (href === "/chat") return pathname === "/chat" || pathname === "/"
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-800 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.8"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {!collapsed && <span className="font-bold text-white tracking-tight">DevPilot</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-800 flex-shrink-0">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.login} className="w-8 h-8 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <span className="text-sm text-gray-300">?</span>
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.login || "未登录"}</p>
                <p className="text-xs text-gray-500 truncate">在线</p>
              </div>
            )}
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          style={{ left: collapsed ? "7rem" : "14.5rem" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
          </svg>
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
