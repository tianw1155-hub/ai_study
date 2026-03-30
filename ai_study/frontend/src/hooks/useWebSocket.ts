"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WebSocketMessage, isTaskStateChangedMessage } from '@/types/websocket';
import { Task, TaskState } from '@/types/task';

const WS_URL = 'wss://api.devpilot.com/ws';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 32000];

/**
 * WebSocket 连接状态
 */
export type WSConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * WebSocket Hook 配置
 */
interface UseWebSocketOptions {
  /** JWT Token（用于认证） */
  token?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 连接状态回调 */
  onStatusChange?: (status: WSConnectionStatus) => void;
  /** 任务状态变更回调 */
  onTaskStateChanged?: (taskId: string, fromState: TaskState, toState: TaskState) => void;
}

/**
 * WebSocket Hook
 * 
 * 功能：
 * - 连接 WebSocket 服务器
 * - 监听 task:state_changed 事件
 * - 更新 React Query 缓存中的任务状态
 * - 处理重连逻辑
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { token, enabled = true, onStatusChange, onTaskStateChanged } = options;
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  const updateStatus = useCallback((status: WSConnectionStatus) => {
    onStatusChange?.(status);
  }, [onStatusChange]);

  const updateTaskInCache = useCallback((taskId: string, updates: Partial<Task>) => {
    queryClient.setQueryData(['tasks'], (oldData: Task[] | undefined) => {
      if (!oldData) return oldData;
      return oldData.map(task => 
        task.id === taskId 
          ? { ...task, ...updates, version: task.version + 1 }
          : task
      );
    });
  }, [queryClient]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      if (isTaskStateChangedMessage(message) && message.from_state && message.to_state) {
        const { taskId, from_state, to_state } = message;
        
        // 更新 React Query 缓存
        updateTaskInCache(taskId, {
          state: to_state as TaskState,
          updated_at: message.timestamp || new Date().toISOString(),
        });
        
        // 触发回调
        onTaskStateChanged?.(taskId, from_state as TaskState, to_state as TaskState);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }, [updateTaskInCache, onTaskStateChanged]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    updateStatus('connecting');

    const protocols = token ? ['Bearer ' + token] : undefined;
    const ws = new WebSocket(WS_URL, protocols);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connected');
      updateStatus('connected');
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = handleMessage;

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      updateStatus('error');
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      updateStatus('disconnected');
      wsRef.current = null;

      // 指数退避重连
      if (enabled) {
        const delay = RECONNECT_DELAYS[
          Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
        ];
        console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptRef.current++;
          connect();
        }, delay);
      }
    };
  }, [token, enabled, updateStatus, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    updateStatus('disconnected');
  }, [updateStatus]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    /** 当前连接状态 */
    status: wsRef.current?.readyState === WebSocket.OPEN ? 'connected' : 
            wsRef.current?.readyState === WebSocket.CONNECTING ? 'connecting' : 'disconnected',
    /** 手动重连 */
    reconnect: connect,
    /** 手动断开连接 */
    disconnect,
  };
}

export default useWebSocket;
