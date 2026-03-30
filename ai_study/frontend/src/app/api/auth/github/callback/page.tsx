"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function GitHubCallback() {
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const error = params.get("error")

    if (error) {
      console.error("GitHub OAuth error:", error)
      router.push("/login?error=" + encodeURIComponent(error))
      return
    }

    if (code) {
      fetch("/api/auth/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.token && data.user) {
            localStorage.setItem("token", data.token)
            localStorage.setItem("user", JSON.stringify(data.user))
            router.push("/")
          } else {
            console.error("Auth failed:", data)
            router.push("/login?error=auth_failed")
          }
        })
        .catch((err) => {
          console.error("Auth error:", err)
          router.push("/login?error=network_error")
        })
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue mx-auto mb-4"></div>
        <p className="text-gray-600">正在登录...</p>
      </div>
    </div>
  )
}
