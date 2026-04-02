"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem("user")
    if (user) {
      router.replace("/chat")
    } else {
      router.replace("/login")
    }
  }, [router])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-transparent border-t-white rounded-full animate-spin" />
        <span className="text-gray-400 text-sm">加载中...</span>
      </div>
    </div>
  )
}
