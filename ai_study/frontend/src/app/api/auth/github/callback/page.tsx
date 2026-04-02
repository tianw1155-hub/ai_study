"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function GitHubCallback() {
  const router = useRouter()
  const [step, setStep] = useState<"loading" | "success" | "error">("loading")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const error = params.get("error")

    if (error) {
      setStep("error")
      setTimeout(() => router.push("/login?error=" + encodeURIComponent(error)), 1500)
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
            setStep("success")
            const modelConfig = localStorage.getItem("model_config")
            setTimeout(() => {
              router.push(modelConfig ? "/chat" : "/setup")
            }, 800)
          } else {
            setStep("error")
            setTimeout(() => router.push("/login?error=auth_failed"), 1500)
          }
        })
        .catch(() => {
          setStep("error")
          setTimeout(() => router.push("/login?error=network_error"), 1500)
        })
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        {step === "loading" && (
          <>
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-gray-400 text-sm">正在登录 GitHub...</p>
          </>
        )}
        {step === "success" && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 text-sm font-medium">登录成功！跳转中...</p>
          </>
        )}
        {step === "error" && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-400 text-sm font-medium">登录失败，稍后重试...</p>
          </>
        )}
      </div>
    </div>
  )
}
