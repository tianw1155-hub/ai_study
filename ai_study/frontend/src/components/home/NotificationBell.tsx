'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Notification {
  id: string;
  type: 'task_state_changed' | 'task_completed' | 'task_failed' | 'system';
  title: string;
  message: string;
  taskId?: string;
  isRead: boolean;
  createdAt: string;
}

// 通知通过 WebSocket 实时推送，不再调用 HTTP API
// 本地维护通知列表（可后续扩展 WebSocket 通知集成）
const mockNotifications: Notification[] = [];

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return `${Math.floor(diff / 86400)} 天前`;
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'task_state_changed':
        return '🔄';
      case 'task_completed':
        return '✅';
      case 'task_failed':
        return '❌';
      default:
        return '📢';
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'task_state_changed':
        return 'text-indigo-600 bg-indigo-50';
      case 'task_completed':
        return 'text-green-600 bg-green-50';
      case 'task_failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 铃铛按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {/* 红点未读标记 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* 下拉列表 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 animate-fade-in">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">通知</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-gray-400">{unreadCount} 条未读</span>
            )}
          </div>

          {/* 列表 */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="p-8 text-center">
                <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-sm text-gray-400">暂无通知</p>
              </div>
            )}

            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`
                  flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer
                  ${!notif.isRead ? 'bg-blue-50/50' : ''}
                `}
              >
                {/* 图标 */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm
                  ${getNotificationColor(notif.type)}`}>
                  {getNotificationIcon(notif.type)}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{notif.title}</p>
                    {!notif.isRead && (
                      <span className="w-2 h-2 bg-brand-blue rounded-full flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatTime(notif.createdAt)}</p>
                </div>

                {/* 跳转 */}
                {notif.taskId && (
                  <a
                    href={`/kanban?task=${notif.taskId}`}
                    className="flex-shrink-0 text-xs text-brand-blue hover:text-blue-700"
                    onClick={() => setIsOpen(false)}
                  >
                    查看
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* 底部 */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 text-center">
              <a
                href="/notifications"
                className="text-xs text-brand-blue hover:text-blue-700 font-medium"
                onClick={() => setIsOpen(false)}
              >
                查看全部通知
              </a>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.15s ease-out;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};
