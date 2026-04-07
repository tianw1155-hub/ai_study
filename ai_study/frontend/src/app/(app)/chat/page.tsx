'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

let _msgIdCounter = 0
const newId = () => `m${Date.now().toString(36)}${(++_msgIdCounter).toString(36)}`
import {
  initSession,
  addMessageToSession,
  createSession,
  deleteSession,
  getSessions,
  setCurrentSessionId,
  getSessionMessages,
  getCurrentSessionId,
  submitDailySummary,
  type ChatMessage,
} from '@/lib/memory'
import { MemoryPanel } from '@/components/chat/MemoryPanel'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  pending?: boolean  // true while streaming
  isWelcome?: boolean // true for system welcome messages
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const REQUIREMENT_CONFIRM_KEYWORDS = ['需求已确认', '需求概要', '好的，我现在开始']

// Check if session already has a welcome message (persists across cache clears)
function hasWelcomeMessage(messages: Message[]): boolean {
  const today = new Date().toDateString()
  return messages.some(m =>
    m.isWelcome && new Date(m.timestamp).toDateString() === today
  )
}

// Parse AI response into thinking and actual content
function parseContent(content: string): { thinking: string; actual: string } {
  // Match common thinking delimiters (English & Chinese)
  const thinkPatterns = [
    /<think>([\s\S]*?)<\/think>/i,
    /<think\b[^>]*>([\s\S]*?)<\/think>/i,
    /\[THINK\]([\s\S]*?)\[\/THINK\]/i,
    /\[思考\]([\s\S]*?)\[\/思考\]/i,
    /<thinking>([\s\S]*?)<\/thinking>/i,
  ]
  for (const pattern of thinkPatterns) {
    const match = content.match(pattern)
    if (match) {
      return {
        thinking: match[1].trim(),
        actual: content.replace(match[0], '').trim()
      }
    }
  }
  return { thinking: '', actual: content }
}


export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('draft_input') || ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<{ login: string } | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showMemory, setShowMemory] = useState(false)
  const [pendingSummary, setPendingSummary] = useState<string | null>(null)
  const [sessions, setSessions] = useState<{ id: string; title: string; date: string; keywords: string[] }[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [prdContent, setPrdContent] = useState<string>('')
  const [requirementId, setRequirementId] = useState<string>('')
  const [reviewStatus, setReviewStatus] = useState<'idle'|'loading'|'completed'>('idle')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const initDone = useRef(false)
  const submittingRef = useRef(false) // guard against double submit

  // Initialize session on mount
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch { /* ignore */ }
    }

    initSession().then(({ sessionId: sid, messages: savedMsgs, pendingSummary: pendSum }) => {
      setSessionId(sid)
      setPendingSummary(pendSum)

      const welcome: Message = {
        id: newId(),
        role: 'assistant',
        isWelcome: true,
        content:
          '👋 你好！我是你的 AI 产品经理。\n\n' +
          (pendSum
            ? `📋 我注意到你昨天有未完成的对话，相关上下文已准备好。\n\n`
            : '') +
          '很高兴见到你！我们可以先聊聊你今天想做的产品。\n\n' +
          '不用着急，随便说说你的想法吧 — 比如你想做什么类型的应用？解决什么问题？有什么具体要求？\n\n' +
          '我会通过提问帮你把需求理清楚，等我们达成共识了，再开始动手做。',
        timestamp: new Date(),
      }

      // Deduplicate by id when restoring
      const seenIds = new Set<string>()
      const restored: Message[] = savedMsgs
        .filter(m => {
          if (seenIds.has(m.id)) return false
          seenIds.add(m.id)
          return true
        })
        .map((m, i) => ({ ...m, id: newId(), timestamp: new Date(m.timestamp) }))
      // Only show welcome if session has no messages yet today
      if (restored.length > 0 || hasWelcomeMessage(restored)) {
        setMessages(restored)
      } else {
        setMessages([...restored, welcome])
        addMessageToSession(sid, { ...welcome, timestamp: welcome.timestamp.toISOString() })
      }
    }).catch(() => {
      const session = createSession()
      setSessionId(session.id)
      const welcome: Message = {
        id: newId(),
        role: 'assistant',
        isWelcome: true,
        content: '👋 你好！我是你的 AI 产品经理。\n\n请描述你想做的应用或功能，我会主动提问直到需求清晰。有什么想法，尽管说！',
        timestamp: new Date(),
      }
      if (!hasWelcomeMessage([])) {
        setMessages([welcome])
        addMessageToSession(session.id, { ...welcome, timestamp: welcome.timestamp.toISOString() })
      } else {
        setMessages([])
      }
    })

    setSessions(getSessions())
  }, [])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [input])

  // Save input draft to localStorage
  useEffect(() => {
    localStorage.setItem('draft_input', input)
  }, [input])

  // Handle pending daily summary
  async function handlePendingSummary() {
    if (!pendingSummary) return
    await submitDailySummary(pendingSummary, user?.login || 'anonymous')
    setPendingSummary(null)
    setMessages(prev => [
      ...prev,
      { id: newId(), role: 'system', content: '✅ 昨日总结已保存到记忆，会在下次提交需求时自动携带。', timestamp: new Date() },
    ])
  }

  // Check if AI response indicates requirements are confirmed
  function detectRequirementConfirmed(content: string): boolean {
    // Strip thinking tags first so we check the actual response
    const { actual } = parseContent(content)
    return REQUIREMENT_CONFIRM_KEYWORDS.some(kw => actual.includes(kw))
  }

  // Extract requirement summary from AI confirmation message
  function extractRequirementSummary(content: string): string {
    // Strip thinking tags first so we only get the actual response
    const { actual } = parseContent(content)
    // After "需求已确认", try to extract the summary
    const lines = actual.split('\n')
    const summaryLines = []
    let capturing = false
    for (const line of lines) {
      if (detectRequirementConfirmed(line) || capturing) {
        capturing = true
        if (!detectRequirementConfirmed(line)) {
          summaryLines.push(line)
        }
      }
    }
    return summaryLines.join('\n').trim() || actual
  }

  // Submit requirement to backend after AI confirms
  async function submitRequirement(prompt: string, userId?: string) {
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const modelConfigRaw = localStorage.getItem('model_config')
      const modelConfig = modelConfigRaw ? JSON.parse(modelConfigRaw) : null

      const payload: Record<string, string> = { prompt }
      if (modelConfig) {
        payload.llm_model = modelConfig.model
        payload.api_key = modelConfig.apiKey
        if (modelConfig.groupId) payload.group_id = modelConfig.groupId
      }
      if (userId) payload.user_id = userId

      const res = await fetch(`${API_BASE}/api/requirements/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '提交失败' }))
        throw new Error(err.error || '提交失败')
      }

      const data = await res.json()
      return `✅ **任务已创建！**\n\n任务 ID：\`${data.task_id || data.requirement_id}\`\n\nAI 团队正在处理中，稍后可在「任务看板」查看进度。`
    } catch (err) {
      return `❌ 任务创建失败：${err instanceof Error ? err.message : '未知错误'}`
    }
  }

  // Generate PRD via LLM after requirements are confirmed
  async function generatePRD(title: string, prompt: string, userId?: string) {
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const modelConfigRaw = localStorage.getItem('model_config')
      const modelConfig = modelConfigRaw ? JSON.parse(modelConfigRaw) : null

      const payload = {
        title,
        prompt,
        user_id: userId || '',
        llm_model: modelConfig?.model || 'MiniMax-M2.7',
        api_key: modelConfig?.apiKey || '',
      }

      const res = await fetch(`${API_BASE}/api/requirements/generate-prd`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'PRD 生成失败' }))
        throw new Error(err.error || 'PRD 生成失败')
      }

      const data = await res.json()
      setRequirementId(data.requirement_id || '')
      setPrdContent(data.prd_content || '')
      setReviewStatus('idle')
      return { id: data.requirement_id, content: data.prd_content }
    } catch (err) {
      throw new Error(`PRD 生成失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  // Submit PRD for review by dev-engineer
  async function submitReview(reqId: string): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      const token = localStorage.getItem('token')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const modelConfigRaw = localStorage.getItem('model_config')
      const modelConfig = modelConfigRaw ? JSON.parse(modelConfigRaw) : null

      if (!modelConfig?.apiKey) {
        return { success: false, error: '请先在模型设置中配置 API Key' }
      }

      const res = await fetch(`${API_BASE}/api/requirements/${reqId}/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          api_key: modelConfig.apiKey,
          llm_model: modelConfig.model || 'MiniMax-M2.7',
        }),
        signal: AbortSignal.timeout(120000),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '评审失败' }))
        return { success: false, error: err.error || '评审失败' }
      }

      const data = await res.json()
      return { success: true, content: data.review_content || '' }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '评审请求失败' }
    }
  }

  // Send message to chat API and stream response
  async function sendToChat(userMessage: Message) {
    const modelConfigRaw = localStorage.getItem('model_config')
    const modelConfig = modelConfigRaw ? JSON.parse(modelConfigRaw) : null

    // Create assistant message for AI response
    const assistantMessage: Message = {
      id: newId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      pending: true,
    }

    if (!modelConfig || !modelConfig.model || !modelConfig.apiKey) {
      // Show error in the assistant message instead of overwriting user message
      const errorMsg: Message = { ...assistantMessage, content: '❌ 请先在「模型设置」中配置 API Key，才能使用对话功能。', pending: false }
      setMessages(prev => [...prev, errorMsg])
      setIsLoading(false)
      return
    }

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    // Build messages for API (include history for context)
    const chatMessages = messages
      .filter(m => !m.pending && m.role !== 'system')
      .slice(-20) // keep last 20 for context
      .concat([userMessage])
      .map(m => ({ role: m.role, content: m.content }))

    // Add assistant message to state (streaming response will update it)
    setMessages(prev => [...prev, assistantMessage])
    if (sessionId) {
      addMessageToSession(sessionId, { ...assistantMessage, timestamp: assistantMessage.timestamp.toISOString() })
    }
    setIsLoading(true)

    try {
      const timeoutMs = 120000
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      try {
        response = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatMessages,
            model: modelConfig.model,
            api_key: modelConfig.apiKey,
            user_id: user?.login,
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: '对话失败' }))
        throw new Error(errData.error || `HTTP ${response.status}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      let fullContent = ''
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            if (data.startsWith('[ERROR]')) {
              controller.abort()
              const errorMsg = data.replace('[ERROR]', '').trim()
              setMessages(prev => prev.map(m =>
                m.id === assistantMessage.id ? { ...m, content: `❌ 对话出错：${errorMsg}`, pending: false } : m
              ))
              return
            }
            // Parse JSON format SSE data (properly handles newlines/special chars)
            try {
              const parsed = JSON.parse(data)
              fullContent += parsed.content || ''
            } catch {
              // Fallback for plain text format
              fullContent += data
            }
            setMessages(prev => prev.map(m =>
              m.id === assistantMessage.id ? { ...m, content: fullContent, pending: true } : m
            ))
          }
        }
      }

      // Check if requirements are confirmed
      const confirmed = detectRequirementConfirmed(fullContent)

      setMessages(prev => prev.map(m =>
        m.id === assistantMessage.id ? { ...m, content: fullContent, pending: false } : m
      ))
      if (sessionId) {
        addMessageToSession(sessionId, { id: assistantMessage.id, role: 'assistant', content: fullContent, timestamp: new Date().toISOString() })
      }

      if (confirmed) {
        // Generate PRD from confirmed requirements
        const summary = extractRequirementSummary(fullContent)
        const prdLoadingMsg: Message = {
          id: newId(),
          role: 'assistant',
          content: '⏳ 正在根据确认的需求生成 PRD 文档...',
          timestamp: new Date(),
          pending: false,
        }
        setMessages(prev => [...prev, prdLoadingMsg])
        if (sessionId) {
          addMessageToSession(sessionId, { ...prdLoadingMsg, timestamp: prdLoadingMsg.timestamp.toISOString() })
        }

        try {
          const prdResult = await generatePRD('需求 PRD', summary, user?.login)
          // Replace loading message with PRD result card
          const prdMsg: Message = {
            id: newId(),
            role: 'assistant',
            content: `📋 **PRD 已生成！**\n\n---\n\n${prdResult.content}\n\n---\n\n上方是生成的 PRD 文档，稍后 dev-engineer 会进行评审。`,
            timestamp: new Date(),
            pending: false,
          }
          setMessages(prev => prev.map(m =>
            m.id === prdLoadingMsg.id ? prdMsg : m
          ))
          if (sessionId) {
            addMessageToSession(sessionId, { ...prdMsg, timestamp: prdMsg.timestamp.toISOString() })
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : '未知错误'
          setMessages(prev => prev.map(m =>
            m.id === prdLoadingMsg.id
              ? { ...m, content: `❌ PRD 生成失败：${errMsg}` }
              : m
          ))
        }
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') return

      const errorMsg = err instanceof Error ? err.message : '未知错误'
      setMessages(prev => prev.map(m =>
        m.id === assistantMessage.id ? { ...m, content: `❌ 对话出错：${errorMsg}`, pending: false } : m
      ))
      if (sessionId) {
        addMessageToSession(sessionId, { id: assistantMessage.id, role: 'assistant', content: `❌ 对话出错：${errorMsg}`, timestamp: new Date().toISOString() })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading || submittingRef.current) return

    submittingRef.current = true
    const userMessage: Message = {
      id: newId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => {
      const updated = [...prev, userMessage]
      if (sessionId) {
        addMessageToSession(sessionId, { ...userMessage, timestamp: userMessage.timestamp.toISOString() })
      }
      return updated
    })

    const currentInput = input
    setInput('')
    localStorage.removeItem('draft_input')

    try {
      // Phase 3: Confirm development after PRD review
      if (reviewStatus === 'completed' && currentInput.includes('确认开发')) {
        setIsLoading(true)
        const confirmMsg: Message = {
          id: newId(),
          role: 'assistant',
          content: '⏳ 正在创建设开发任务...',
          timestamp: new Date(),
          pending: false,
        }
        setMessages(prev => [...prev, confirmMsg])
        if (sessionId) {
          addMessageToSession(sessionId, { ...confirmMsg, timestamp: confirmMsg.timestamp.toISOString() })
        }

        try {
          const token = localStorage.getItem('token')
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (token) headers['Authorization'] = `Bearer ${token}`

          const res = await fetch(`${API_BASE}/api/tasks/create`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: `开发任务`,
              type: 'code',
              priority: 'medium',
              user_id: user?.login,
              requirement_id: requirementId,
            }),
          })

          if (!res.ok) throw new Error('任务创建失败')
          const task = await res.json()

          const successMsg: Message = {
            id: newId(),
            role: 'assistant',
            content: `✅ **开发任务已创建！**\n\n任务ID: \`${task.id}\`\n状态: pending\n\n正在跳转看板页面...`,
            timestamp: new Date(),
            pending: false,
          }
          setMessages(prev => prev.map(m => m.id === confirmMsg.id ? successMsg : m))
          if (sessionId) {
            addMessageToSession(sessionId, { ...successMsg, timestamp: successMsg.timestamp.toISOString() })
          }

          // Reset states
          setReviewStatus('idle')
          setRequirementId('')
          setPrdContent('')

          // Redirect to kanban
          window.location.href = '/kanban'
          return
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : '未知错误'
          setMessages(prev => prev.map(m =>
            m.id === confirmMsg.id ? { ...m, content: `❌ 任务创建失败：${errMsg}` } : m
          ))
          setIsLoading(false)
          return
        }
      }

      // If pending summary, submit it first
      if (pendingSummary && currentInput.trim()) {
        await handlePendingSummary()
      }

      // Send to chat
      await sendToChat(userMessage)
    } finally {
      submittingRef.current = false
    }
  }, [input, isLoading, sessionId, pendingSummary, user, reviewStatus, requirementId])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function switchSession(sid: string) {
    setCurrentSessionId(sid)
    setSessionId(sid)
    // Deduplicate by id when restoring
    const seenIds = new Set<string>()
    const msgs = getSessionMessages(sid)
      .filter(m => {
        if (seenIds.has(m.id)) return false
        seenIds.add(m.id)
        return true
      })
      .map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
    // Only show simple greeting if no messages
    if (msgs.length === 0 && !hasWelcomeMessage([])) {
      const welcome: Message = {
        id: newId(),
        role: 'assistant',
        isWelcome: true,
        content: '👋 回来了！我们继续聊聊。想聊什么？',
        timestamp: new Date(),
      }
      setMessages([welcome])
      addMessageToSession(sid, { ...welcome, timestamp: welcome.timestamp.toISOString() })
    } else {
      setMessages(msgs)
    }
    setShowHistory(false)
  }

  function startNewSession() {
    const session = createSession()
    setSessionId(session.id)
    setSessions(getSessions())
    if (!hasWelcomeMessage([])) {
      const welcome: Message = {
        id: newId(),
        role: 'assistant',
        isWelcome: true,
        content: '👋 新会话开始了！今天想做点什么？随便说说你的想法吧。',
        timestamp: new Date(),
      }
      setMessages([welcome])
      addMessageToSession(session.id, { ...welcome, timestamp: welcome.timestamp.toISOString() })
    } else {
      setMessages([])
    }
    setShowHistory(false)
    setPendingSummary(null)
  }

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsLoading(false)
      setMessages(prev => prev.map(m =>
        m.pending ? { ...m, pending: false } : m
      ))
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            历史会话
          </button>
          {sessions.length > 0 && (
            <span className="text-xs text-gray-600">{sessions.length} 个会话</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Memory button */}
          <button
            onClick={() => setShowMemory(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <span>🧠</span>
            <span>记忆中心</span>
            {pendingSummary && (
              <span className="w-2 h-2 bg-blue-500 rounded-full" title="有未处理的每日总结" />
            )}
          </button>
        </div>
      </div>

      {/* Session history dropdown */}
      {showHistory && (
        <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <span className="text-xs text-gray-500 flex-shrink-0">切换会话</span>
            <div className="flex gap-2 overflow-x-auto flex-1">
              <button
                onClick={startNewSession}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                + 新会话
              </button>
              {sessions.slice(0, 8).map(s => (
                <div key={s.id} className="flex-shrink-0 group relative">
                  <button
                    onClick={() => switchSession(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      s.id === sessionId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {s.title}
                  </button>
                  {sessions.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`删除会话「${s.title}」？`)) { deleteSession(s.id); setSessions(getSessions()); } }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      title="删除会话"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pending daily summary banner */}
      {pendingSummary && (
        <div className="flex-shrink-0 bg-blue-500/10 border-b border-blue-500/20 px-4 py-2">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-blue-300">
              <span>📋</span>
              <span>昨日总结已准备好，将在下次提交需求时自动携带</span>
            </div>
            <button
              onClick={handlePendingSummary}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              立即保存
            </button>
          </div>
        </div>
      )}

      {/* Messages + PRD Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, idx) => (
          <div key={`${msg.id}_idx${idx}`} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : msg.role === 'assistant'
                  ? 'bg-gray-800 text-white border border-gray-700'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              {msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '💤'}
            </div>
            <div className={`max-w-2xl flex-1 leading-relaxed ${msg.role === 'user' ? 'text-right' : ''}`}>
              {msg.role === 'assistant' && !msg.pending && parseContent(msg.content).thinking && (
                <details className="mb-2 group">
                  <summary className="cursor-pointer flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 select-none list-none">
                    <span className="transition-transform group-open:rotate-90">▶</span>
                    <span>🤔 思考过程</span>
                  </summary>
                  <div className="mt-1.5 ml-4 pl-3 border-l-2 border-gray-700 text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">
                    {parseContent(msg.content).thinking}
                  </div>
                </details>
              )}
              <div
                className={`inline-block px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white rounded-tr-md'
                    : msg.role === 'assistant'
                    ? msg.pending
                      ? 'bg-gray-900 text-gray-100 border border-gray-800 rounded-tl-md animate-pulse'
                      : 'bg-gray-900 text-gray-100 border border-gray-800 rounded-tl-md'
                    : 'bg-gray-800 text-gray-300 text-xs italic'
                }`}
              >
                {msg.role === 'assistant' && !msg.pending ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                  >
                    {parseContent(msg.content).actual}
                  </ReactMarkdown>
                ) : msg.content}
                {msg.pending && (
                  <span className="inline-block ml-1 animate-pulse">▊</span>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
        </div>

        {/* PRD Preview Panel */}
        {prdContent && (
          <div className="w-96 border-l border-gray-800 overflow-y-auto bg-gray-900/50">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">📋 PRD 预览</h3>
                <button
                  onClick={() => setPrdContent('')}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-4 prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {prdContent}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* PRD Review Action Bar */}
      {requirementId && reviewStatus === 'idle' && (
        <div className="flex-shrink-0 border-t border-blue-800/50 bg-blue-950/30 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-blue-300">
              <span>📋</span>
              <span>PRD 已生成，可以提交给 dev-engineer 评审</span>
            </div>
            <button
              onClick={async () => {
                setReviewStatus('loading')
                const loadingMsg: Message = {
                  id: newId(),
                  role: 'assistant',
                  content: '⏳ dev-engineer 正在评审 PRD，请稍候...',
                  timestamp: new Date(),
                  pending: false,
                }
                setMessages(prev => [...prev, loadingMsg])
                if (sessionId) {
                  addMessageToSession(sessionId, { ...loadingMsg, timestamp: loadingMsg.timestamp.toISOString() })
                }
                const result = await submitReview(requirementId)
                const reviewMsg: Message = {
                  id: newId(),
                  role: 'assistant',
                  content: result.success
                    ? `📊 **dev-engineer 评审完成**\n\n${result.content}\n\n---\n💡 评审已完成，请确认是否同意上述评审结论。如无异议，输入「确认开发」开始编码。`
                    : `❌ 评审失败：${result.error}`,
                  timestamp: new Date(),
                  pending: false,
                }
                setMessages(prev => {
                  const updated = prev.map(m =>
                    m.id === loadingMsg.id ? reviewMsg : m
                  )
                  return updated
                })
                if (sessionId) {
                  addMessageToSession(sessionId, { ...reviewMsg, timestamp: reviewMsg.timestamp.toISOString() })
                }
                if (result.success) {
                  setReviewStatus('completed')
                } else {
                  setReviewStatus('idle')
                }
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              提交评审
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想做的功能，我会帮你理清需求..."
              rows={1}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 pr-20 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ maxHeight: '160px' }}
            />
            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="w-8 h-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center transition-colors"
                  title="停止生成"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              ) : (
                <span className="text-xs text-gray-600 hidden sm:block">↵ 发送</span>
              )}
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </form>
          <p className="text-xs text-gray-600 mt-2 text-center">
            {isLoading ? 'AI 正在思考...' : 'AI 助手基于你的 API Key 运行，请确保已在「模型设置」中配置'}
          </p>
        </div>
      </div>

      {/* Memory panel */}
      {showMemory && (
        <MemoryPanel userId={user?.login} onClose={() => setShowMemory(false)} />
      )}
    </div>
  )
}
