/**
 * 记忆管理模块
 * - 短期记忆：会话上下文、昨日总结
 * - 长期记忆：持久化到后端数据库
 */

export interface MemoryEntry {
  id?: string
  user_id?: string
  type: 'session_summary' | 'daily_summary' | 'project_context' | 'user_preference'
  content: string
  summary?: string
  keywords?: string
  created_at?: string
  last_used_at?: string
  use_count?: number
}

// ============================================================
// localStorage Keys
// ============================================================
const KEYS = {
  SESSIONS: 'devpilot_sessions',          // 所有历史会话列表
  CURRENT_SESSION: 'devpilot_current_session', // 当前会话ID
  LAST_SESSION_DATE: 'devpilot_last_session_date', // 上次会话日期
  SESSION_PREFIX: 'devpilot_session_',   // 会话详情前缀
  DAILY_SUMMARY: 'devpilot_daily_summary', // 每日总结
  LAST_DAILY_SUMMARY_DATE: 'devpilot_last_daily_summary_date', // 上次生成总结日期
  PENDING_DAILY_SUMMARY: 'devpilot_pending_summary', // 待提交的每日总结（下次打开时用）
} as const

// ============================================================
// Session Types
// ============================================================
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface Session {
  id: string
  title: string
  date: string          // YYYY-MM-DD
  createdAt: string     // ISO timestamp
  updatedAt: string     // ISO timestamp
  messageCount: number
  keywords: string[]    // 自动提取的关键词
}

// ============================================================
// 核心：会话管理
// ============================================================

/** 获取所有会话列表（按更新时间倒序） */
export function getSessions(): Session[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEYS.SESSIONS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 保存会话列表 */
function saveSessions(sessions: Session[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions))
}

/** 获取当前会话ID */
export function getCurrentSessionId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(KEYS.CURRENT_SESSION)
}

/** 设置当前会话ID */
export function setCurrentSessionId(id: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEYS.CURRENT_SESSION, id)
}

/** 获取单个会话的消息 */
export function getSessionMessages(sessionId: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEYS.SESSION_PREFIX + sessionId)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 保存会话消息 */
export function saveSessionMessages(sessionId: string, messages: ChatMessage[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEYS.SESSION_PREFIX + sessionId, JSON.stringify(messages))
}

/** 创建新会话 */
export function createSession(): Session {
  const now = new Date().toISOString()
  const today = now.split('T')[0]
  const session: Session = {
    id: `session_${Date.now()}`,
    title: `对话 ${today}`,
    date: today,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    keywords: [],
  }

  const sessions = getSessions()
  sessions.unshift(session)
  // 最多保留50个会话
  if (sessions.length > 50) sessions.splice(50)
  saveSessions(sessions)
  setCurrentSessionId(session.id)
  saveSessionMessages(session.id, [])

  return session
}

/** 更新会话信息（标题、关键词、消息数） */
export function updateSession(sessionId: string, updates: Partial<Pick<Session, 'title' | 'keywords' | 'messageCount'>>) {
  const sessions = getSessions()
  const idx = sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) return
  sessions[idx] = { ...sessions[idx], ...updates, updatedAt: new Date().toISOString() }
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  saveSessions(sessions)
}

/** 添加消息到当前会话 */
export function addMessageToSession(sessionId: string, message: ChatMessage) {
  const messages = getSessionMessages(sessionId)
  messages.push(message)
  saveSessionMessages(sessionId, messages)

  // 更新会话统计
  const sessions = getSessions()
  const session = sessions.find(s => s.id === sessionId)
  if (session) {
    session.messageCount = messages.length
    session.updatedAt = new Date().toISOString()
    // 从用户消息中提取关键词
    if (message.role === 'user') {
      const words = extractKeywords(message.content)
      session.keywords = [...new Set([...session.keywords, ...words])].slice(0, 10)
    }
    updateSession(sessionId, session)
  }
}

/** 提取关键词 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那', '和', '就', '都', '也', '要', '会', '能', '可以', '一个', '什么', '怎么', '如何', '为', '与', '及', '或', '但', '如果', '因为', '所以', '虽然', '然后', '还是', '以及', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can'])
  const words = text.match(/[\w\u4e00-\u9fff]{2,}/g) || []
  return [...new Set(words.filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase())))].slice(0, 5)
}

// ============================================================
// 每日总结逻辑
// ============================================================

/** 检查是否需要生成每日总结（上次总结日期 < 今天） */
export function shouldGenerateDailySummary(): boolean {
  if (typeof window === 'undefined') return false
  const today = new Date().toISOString().split('T')[0]
  const lastDate = localStorage.getItem(KEYS.LAST_DAILY_SUMMARY_DATE)
  return lastDate !== today
}

/** 获取待提交的每日总结 */
export function getPendingDailySummary(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(KEYS.PENDING_DAILY_SUMMARY)
}

/** 生成并存储每日总结（基于昨天的会话） */
export async function generateDailySummary(): Promise<string | null> {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // 找到昨天的会话
  const sessions = getSessions()
  const yesterdaySessions = sessions.filter(s => s.date === yesterday)

  if (yesterdaySessions.length === 0) {
    // 没有昨天的会话，直接标记今天
    localStorage.setItem(KEYS.LAST_DAILY_SUMMARY_DATE, today)
    return null
  }

  // 收集昨天的所有用户消息
  let allUserContent = ''
  for (const session of yesterdaySessions) {
    const messages = getSessionMessages(session.id)
    for (const msg of messages) {
      if (msg.role === 'user') {
        allUserContent += `- ${msg.content}\n`
      }
    }
  }

  if (!allUserContent.trim()) {
    localStorage.setItem(KEYS.LAST_DAILY_SUMMARY_DATE, today)
    return null
  }

  // 提取关键词
  const keywords = extractKeywords(allUserContent)

  const summary = `日期: ${yesterday}\n用户需求摘要:\n${allUserContent}\n涉及关键词: ${keywords.join(', ')}`

  // 保存待提交
  localStorage.setItem(KEYS.PENDING_DAILY_SUMMARY, summary)
  localStorage.setItem(KEYS.LAST_DAILY_SUMMARY_DATE, today)

  return summary
}

/** 提交每日总结到后端（异步） */
export async function submitDailySummary(summary: string, userId: string): Promise<void> {
  try {
    const token = localStorage.getItem('token')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/memory`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: userId || 'anonymous',
        type: 'daily_summary',
        content: summary,
        keywords: new Date().toISOString().split('T')[0],
      }),
    })
    // 清空待提交
    localStorage.removeItem(KEYS.PENDING_DAILY_SUMMARY)
  } catch (err) {
    console.error('[Memory] Failed to submit daily summary:', err)
  }
}

// ============================================================
// 记忆面板：长期记忆 CRUD（调用后端 API）
// ============================================================
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }
}

/** 获取记忆列表 */
export async function fetchMemories(userId?: string, type?: string): Promise<MemoryEntry[]> {
  const params = new URLSearchParams()
  if (userId) params.set('user_id', userId)
  if (type) params.set('type', type)

  const res = await fetch(`${API_BASE}/api/memory?${params}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.memories || []).map((m: MemoryEntry) => ({
    ...m,
    created_at: m.created_at || new Date().toISOString(),
    last_used_at: m.last_used_at || new Date().toISOString(),
  }))
}

/** 创建记忆 */
export async function createMemory(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'last_used_at' | 'use_count'>): Promise<MemoryEntry> {
  const res = await fetch(`${API_BASE}/api/memory`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(entry),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.memory
}

/** 删除记忆 */
export async function deleteMemory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/memory/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/** 更新记忆 */
export async function updateMemory(id: string, content: string, keywords?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/memory/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ content, keywords }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/** 获取相关记忆（根据 prompt 关键词） */
export async function fetchRelevantMemories(prompt: string, userId?: string): Promise<MemoryEntry[]> {
  const params = new URLSearchParams({ prompt })
  if (userId) params.set('user_id', userId)
  const res = await fetch(`${API_BASE}/api/memory/relevant?${params}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.memories || []
}

/** 将当前会话摘要存入长期记忆 */
export async function saveSessionAsMemory(sessionId: string, userId?: string): Promise<void> {
  const messages = getSessionMessages(sessionId)
  if (messages.length === 0) return

  const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content)
  if (userMsgs.length === 0) return

  const keywords = extractKeywords(userMsgs.join(' ')).join(',')
  const content = `会话摘要（${new Date().toISOString().split('T')[0]}）:\n` + userMsgs.map(m => `- ${m}`).join('\n')

  await createMemory({
    user_id: userId || 'anonymous',
    type: 'session_summary',
    content,
    summary: userMsgs[0]?.slice(0, 100) || '',
    keywords,
  })
}

// ============================================================
// 初始化：会话恢复
// ============================================================

/**
 * 初始化会话：
 * - 检查日期，如果昨天有会话，生成每日总结
 * - 恢复上次会话或创建新会话
 * - 返回当前会话ID和消息
 */
export async function initSession(): Promise<{ sessionId: string; messages: ChatMessage[]; pendingSummary: string | null }> {
  // 检查是否需要生成每日总结
  if (shouldGenerateDailySummary()) {
    await generateDailySummary()
  }

  const pendingSummary = getPendingDailySummary()

  // 尝试恢复上次会话
  const currentSessionId = getCurrentSessionId()
  if (currentSessionId) {
    const messages = getSessionMessages(currentSessionId)
    if (messages.length > 0) {
      return { sessionId: currentSessionId, messages, pendingSummary }
    }
  }

  // 没有历史会话，创建新会话
  const session = createSession()
  return { sessionId: session.id, messages: [], pendingSummary }
}
