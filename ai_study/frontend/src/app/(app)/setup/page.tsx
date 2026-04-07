"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface ModelOption {
  id: string
  name: string
  provider: string
  description: string
  supportsVision?: boolean
}

const MODELS: ModelOption[] = [
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", description: "最新全能模型，支持视觉" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", description: "轻量快速，性价比高" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "OpenAI", description: "强推理，支持128k上下文" },
  // Anthropic
  { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", provider: "Anthropic", description: "最佳平衡，编程能力强", supportsVision: true },
  { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", provider: "Anthropic", description: "极速响应，轻量级" },
  { id: "claude-3-opus-latest", name: "Claude 3 Opus", provider: "Anthropic", description: "旗舰模型，最强推理", supportsVision: true },
  // Google
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google", description: "高速通用，支持视觉" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "Google", description: "超大上下文，1M tokens" },
  // Grok
  { id: "grok-3", name: "Grok 3", provider: "xAI", description: "xAI 最新模型，带搜索" },
  { id: "grok-2", name: "Grok 2", provider: "xAI", description: "快速响应，实时信息" },
  // MiniMax
  { id: "MiniMax-Text-01", name: "MiniMax Text 01", provider: "MiniMax", description: "超长上下文，200k tokens" },
  { id: "abab6.5s-chat", name: "ABAB 6.5S", provider: "MiniMax", description: "快速对话，优化中文" },
  { id: "abab6.5-chat", name: "ABAB 6.5", provider: "MiniMax", description: "全能型，支持插件" },
  { id: "minimax-m2.7", name: "MiniMax M2.7", provider: "MiniMax", description: "最新旗舰模型，超强推理" },
]

const PROVIDERS = ["全部", "OpenAI", "Anthropic", "Google", "xAI", "MiniMax"]

export default function SetupPage() {
  const router = useRouter()
  const [selectedModel, setSelectedModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  // Load from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const saved = localStorage.getItem('model_config')
    if (saved) {
      try {
        const cfg = JSON.parse(saved)
        if (cfg.model) setSelectedModel(cfg.model)
        if (cfg.apiKey) setApiKey(cfg.apiKey)
      } catch { /* ignore */ }
    }
  }, [])
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState("全部")
  const [showSuccess, setShowSuccess] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState('')
  const filteredModels = selectedProvider === "全部"
    ? MODELS
    : MODELS.filter(m => m.provider === selectedProvider)

  const handleSave = async () => {
    if (!selectedModel || !apiKey.trim()) {
      setTestError('请选择模型并输入 API Key')
      return
    }
    setTesting(true)
    setTestError('')

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          model: selectedModel,
          api_key: apiKey.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'API Key 验证失败' }))
        setTestError(err.error || 'API Key 验证失败')
        setTesting(false)
        return
      }
    } catch (e) {
      setTestError('无法连接到服务器，请检查后端是否运行')
      setTesting(false)
      return
    }

    setTesting(false)
    localStorage.setItem('model_config', JSON.stringify({
      model: selectedModel,
      apiKey: apiKey.trim(),
    }))
    setShowSuccess(true)
    setTimeout(() => {
      router.push('/')
    }, 1200)
  }

  const handleSkip = () => {
    router.push("/")
  }

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center p-4 bg-gray-950">
      <div className="bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">配置你的 AI 模型</h1>
          <p className="text-blue-100 text-sm">选择你喜欢的模型并填入你自己的 API Key，完全自主可控</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Model Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              1. 选择模型
            </label>

            {/* Provider tabs */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {PROVIDERS.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedProvider(p)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedProvider === p
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Model grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {filteredModels.map(model => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedModel === model.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-gray-700 hover:border-gray-600 hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedModel === model.id ? "border-blue-500" : "border-gray-600"
                    }`}>
                      {selectedModel === model.id && (
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-200 text-sm">{model.name}</div>
                      <div className="text-xs text-gray-500">{model.provider} · {model.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* API Key Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              2. 填入 API Key
            </label>
            <div className="relative">
              <input
                type={apiKeyVisible ? "text" : "password"}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-3 pr-12 border border-gray-700 rounded-lg bg-gray-950 text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setApiKeyVisible(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {apiKeyVisible ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              API Key 仅存储在本地浏览器中，不会发送到我们的服务器
            </p>
            {testError && (
              <p className="mt-2 text-xs text-red-400">{testError}</p>
            )}
            {testing && (
              <p className="mt-2 text-xs text-blue-400">正在验证 API Key...</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSkip}
              className="px-4 py-2.5 text-gray-400 hover:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              稍后设置
            </button>
            <button
              onClick={handleSave}
              disabled={testing}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
            >
              {testing ? '验证中...' : '保存并继续'}
            </button>
          </div>
        </div>

        {/* Success toast */}
        {showSuccess && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-green-400 font-medium">配置已保存，正在跳转...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
