'use client'

import { useState, useEffect } from 'react'
import { fetchMemories, createMemory, deleteMemory, updateMemory, type MemoryEntry } from '@/lib/memory'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface MemoryPanelProps {
  userId?: string
  onClose: () => void
}

const MEMORY_TYPE_LABELS: Record<string, string> = {
  session_summary: '会话摘要',
  daily_summary: '每日总结',
  project_context: '项目上下文',
  user_preference: '用户偏好',
}

const MEMORY_TYPE_COLORS: Record<string, 'default' | 'success' | 'warning' | 'info' | 'danger'> = {
  session_summary: 'info',
  daily_summary: 'success',
  project_context: 'warning',
  user_preference: 'default',
}

export function MemoryPanel({ userId, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'session_summary' | 'daily_summary' | 'project_context' | 'user_preference'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<MemoryEntry['type']>('project_context')
  const [newKeywords, setNewKeywords] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadMemories()
  }, [userId])

  async function loadMemories() {
    setLoading(true)
    try {
      const data = await fetchMemories(userId)
      setMemories(data)
    } catch (e) {
      console.error('[MemoryPanel] Failed to load:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!newContent.trim()) return
    setSaving(true)
    try {
      const mem = await createMemory({
        user_id: userId || 'anonymous',
        type: newType,
        content: newContent.trim(),
        keywords: newKeywords.trim(),
      })
      setMemories(prev => [mem, ...prev])
      setShowAdd(false)
      setNewContent('')
      setNewKeywords('')
    } catch (e) {
      console.error('[MemoryPanel] Failed to add:', e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await deleteMemory(id)
      setMemories(prev => prev.filter(m => m.id !== id))
    } catch (e) {
      console.error('[MemoryPanel] Failed to delete:', e)
    } finally {
      setDeleting(null)
    }
  }

  const filtered = activeTab === 'all' ? memories : memories.filter(m => m.type === activeTab)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">🧠 记忆中心</h2>
            <p className="text-xs text-gray-500 mt-0.5">长期记忆，跨会话记住重要上下文</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 overflow-x-auto">
          {(['all', 'session_summary', 'daily_summary', 'project_context', 'user_preference'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tab === 'all' ? '全部' : MEMORY_TYPE_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Add button */}
        <div className="px-6 py-3 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAdd(true)}
          >
            + 添加记忆
          </Button>
        </div>

        {/* Memory list */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-3">
          {loading && (
            <div className="text-center text-gray-500 py-8">加载中...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-gray-600 py-8 text-sm">
              暂无记忆，点击「添加记忆」开始记录
            </div>
          )}
          {!loading && filtered.map(mem => (
            <div key={mem.id} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Badge variant={MEMORY_TYPE_COLORS[mem.type] || 'default'}>
                  {MEMORY_TYPE_LABELS[mem.type] || mem.type}
                </Badge>
                <button
                  onClick={() => mem.id && handleDelete(mem.id)}
                  disabled={deleting === mem.id}
                  className="text-gray-500 hover:text-red-400 text-xs transition-colors disabled:opacity-50"
                >
                  {deleting === mem.id ? '删除中...' : '删除'}
                </button>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {mem.content}
              </p>
              {mem.keywords && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {mem.keywords.split(',').filter(Boolean).map(kw => (
                    <span key={kw} className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">
                      #{kw.trim()}
                    </span>
                  ))}
                </div>
              )}
              {mem.created_at && (
                <p className="text-xs text-gray-600 mt-2">
                  {new Date(mem.created_at).toLocaleDateString('zh-CN')}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Add memory form */}
        {showAdd && (
          <div className="border-t border-gray-700 p-6 bg-gray-900">
            <h3 className="text-sm font-medium text-gray-300 mb-3">添加新记忆</h3>
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {(['session_summary', 'daily_summary', 'project_context', 'user_preference'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setNewType(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      newType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {MEMORY_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="输入记忆内容..."
                rows={4}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <input
                value={newKeywords}
                onChange={e => setNewKeywords(e.target.value)}
                placeholder="关键词（逗号分隔）：React, TypeScript, 登录功能"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="text-gray-400">
                  取消
                </Button>
                <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !newContent.trim()}>
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
