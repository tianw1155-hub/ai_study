import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "DevPilot - AI 开发团队平台",
  description: "用自然语言，创造任何应用",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  )
}
