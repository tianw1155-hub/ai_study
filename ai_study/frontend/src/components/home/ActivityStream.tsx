'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { WebSocketMessage } from '@/types/websocket';

const WS_URL = 'wss://api.devpilot.com/ws';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000];
const MAX_VISIBLE = 20;

interface ActivityItem extends WebSocketMessage {
  localId: string;
  receivedAt: Date;
}

const AGENT_COLORS: Record<string, string> = {
  Planner: 'text-purple-600',
  Coder: 'text-blue-600',
  Tester: 'text-green-600',
  Deployer: 'text-orange-600',
};

const AGENT_BG: Record<string, string> = {
  Planner: 'bg-purple-100',
  Coder: 'bg-blue-100',
  Tester: 'bg-green-100',
  Deployer: 'bg-orange-100',
};

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  'task:started': {
    icon: '🚀',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    label: '开始执行',
  },
  'task:progress': {
    icon: '⚡',
    color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    label: '进行中',
  },
  'task:completed': {
    icon: '✅',
    color: 'text-green-600 bg-green-50 border-green-200',
    label: '已完成',
  },
  'task:failed': {
    icon: '❌',
    color: 'text-red-600 bg-red-50 border-red-200',
    label: '执行失败',
  },
  'task:heartbeat': {
    icon: '💓',
    color: 'text-pink-600 bg-pink-50 border-pink-200',
    label: '心跳',
  },
  'task:state_changed': {
    icon: '🔄',
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    label: '状态变更',
  },
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s 前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m 前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h 前`;
  return `${Math.floor(diff / 86400)}d 前`;
}

export const ActivityStream: React.FC = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [showAll, setShowAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');

    // 从 localStorage 或 cookie 获取 JWT
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';

    const ws = new WebSocket(WS_URL, 'Bearer ' + token);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
      setIsLoading(false);
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        const item: ActivityItem = {
          ...data,
          localId: data.id || `${Date.now()}-${Math.random()}`,
          receivedAt: new Date(data.timestamp || Date.now()),
        };
        setActivities((prev) => {
          const updated = [item, ...prev];
          return updated.slice(0, 100); // 最多保留 100 条
        });
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
      setIsLoading(false);
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;

      // 指数退避重连：1s→2s→4s→8s→16s→32s，最多 6 次
      if (reconnectAttempts.current < RECONNECT_DELAYS.length) {
        const delay = RECONNECT_DELAYS[reconnectAttempts.current];
        reconnectTimeout.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connect]);

  // 每分钟更新时间戳
  useEffect(() => {
    const interval = setInterval(() => {
      setActivities((prev) => [...prev]); // 触发重新渲染
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const visibleActivities = showAll ? activities : activities.slice(0, MAX_VISIBLE);

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connecting':
        return (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            连接中...
          </span>
        );
      case 'connected':
        return (
          <span className="flex items-center gap-1.5 text-xs text-green-600">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            已连接
          </span>
        );
      case 'disconnected':
        return (
          <span className="flex items-center gap-1.5 text-xs text-red-500">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            断开
          </span>
        );
    }
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">实时动态</h3>
          {getStatusBadge()}
        </div>
        {connectionStatus === 'disconnected' && (
          <button
            onClick={connect}
            className="text-xs text-brand-blue hover:text-blue-700 font-medium"
          >
            重连
          </button>
        )}
      </div>

      {/* Content */}
      <div className="relative">
        {/* 骨架屏 loading */}
        {isLoading && connectionStatus === 'connecting' && (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-200 dark:bg-zinc-700 rounded-lg animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-gray-100 dark:bg-zinc-800 rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 断连提示 */}
        {connectionStatus === 'disconnected' && !isLoading && (
          <div className="p-4 text-center">
            <p className="text-sm text-red-500 mb-2">WebSocket 连接已断开</p>
            <button
              onClick={connect}
              className="text-sm text-brand-blue hover:text-blue-700 font-medium"
            >
              点击重连
            </button>
          </div>
        )}

        {/* 空状态 */}
        {!isLoading && connectionStatus !== 'disconnected' && activities.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400">暂无动态</p>
            <p className="text-xs text-gray-400 mt-1">提交需求后将显示实时进度</p>
          </div>
        )}

        {/* 活动列表 */}
        {visibleActivities.length > 0 && (
          <div ref={listRef} className="max-h-80 overflow-y-auto">
            <div className="p-4 space-y-3">
              {visibleActivities.map((activity, idx) => {
                const config = EVENT_CONFIG[activity.event] || EVENT_CONFIG['task:progress'];
                const isNew = idx === 0;

                return (
                  <div
                    key={activity.localId}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border transition-all duration-300
                      ${config.color}
                      ${isNew ? 'animate-slide-in' : ''}
                    `}
                  >
                    {/* 图标 */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center text-base">
                      {config.icon}
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {activity.agent && (
                          <span className={`text-xs font-semibold ${AGENT_COLORS[activity.agent]}`}>
                            {activity.agent}
                          </span>
                        )}
                        <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">
                          {activity.action || config.label}
                        </span>
                      </div>
                      {activity.detail && (
                        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 truncate">
                          {activity.detail}
                        </p>
                      )}
                      {activity.event === 'task:failed' && activity.error && (
                        <p className="text-xs text-red-500 mt-0.5">
                          错误: {activity.error}
                        </p>
                      )}
                      {activity.event === 'task:state_changed' && (
                        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                          {activity.from_state} → {activity.to_state}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatRelativeTime(activity.receivedAt)}
                      </p>
                    </div>

                    {/* 任务 ID */}
                    {activity.taskId && (
                      <span className="flex-shrink-0 text-xs text-gray-400 font-mono">
                        #{activity.taskId.slice(0, 6)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 展开更多 */}
            {!showAll && activities.length > MAX_VISIBLE && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50
                  border-t border-gray-100 dark:border-zinc-800 transition-colors"
              >
                展开更多 ({activities.length - MAX_VISIBLE} 条)
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};
