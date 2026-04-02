"use client"

import { useState } from "react"

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGitHubLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    if (!clientId || clientId === "your_github_client_id_here") {
      setError("GitHub Client ID 未配置，请检查 .env.local")
      return
    }
    setIsLoading(true)
    const redirectUri = `${window.location.origin}/api/auth/github/callback`
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email`
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-950">
      {/* Animated background gradient */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600 rounded-full opacity-20 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600 rounded-full opacity-20 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-128 h-128 bg-violet-600 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        {/* Logo + Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-6 shadow-lg shadow-blue-500/30">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.8"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">DevPilot</h1>
          <p className="text-gray-400 text-sm">AI 开发团队平台</p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-sm">
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-1">开始使用</h2>
              <p className="text-sm text-gray-400">使用 GitHub 账号登录，快速开始开发</p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            <button
              onClick={handleGitHubLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl
                bg-white text-gray-900 font-semibold text-sm
                hover:bg-gray-100 active:scale-[0.98]
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-all duration-150 shadow-lg"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  <span>跳转中...</span>
                </>
              ) : (
                <>
                  <svg height="20" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <span>Continue with GitHub</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto opacity-50">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>

            {/* Feature hints */}
            <div className="mt-6 pt-6 border-t border-white/5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: "⚡", label: "PM Agent" },
                  { icon: "💻", label: "Coder" },
                  { icon: "🧪", label: "Tester" },
                ].map((f) => (
                  <div key={f.label} className="text-center">
                    <div className="text-lg mb-1">{f.icon}</div>
                    <div className="text-xs text-gray-500">{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-gray-500">
            登录即表示您同意我们的服务条款和隐私政策
          </p>
        </div>
      </div>
    </div>
  )
}
