'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { DeploymentLog } from '@/types/delivery';

const WS_URL = 'wss://api.devpilot.com/ws';
const RECONNECT_INTERVAL = 3000;

interface UseDeploymentWebSocketOptions {
  taskId: string;
  deploymentId: string | null;
}

export function useDeploymentWebSocket(
  taskId: string,
  deploymentId: string | null
): { logs: DeploymentLog[] } {
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL, ['wss://api.devpilot.com/ws']);

      ws.onopen = () => {
        if (deploymentId) {
          ws.send(
            JSON.stringify({
              event: 'deployment:subscribe',
              taskId,
              deploymentId,
            })
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.event === 'deployment:started') {
            setLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                message: '部署已开始',
                level: 'info',
              },
            ]);
          }

          if (data.event === 'deployment:progress') {
            setLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                message: data.message || '部署中...',
                level: 'info',
              },
            ]);
          }

          if (data.event === 'deployment:completed') {
            setLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                message: '部署完成',
                level: 'success',
              },
            ]);
          }

          if (data.event === 'deployment:failed') {
            setLogs((prev) => [
              ...prev,
              {
                timestamp: new Date().toISOString(),
                message: `部署失败: ${data.error || '未知错误'}`,
                level: 'error',
              },
            ]);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL);
    }
  }, [taskId, deploymentId]);

  useEffect(() => {
    if (!deploymentId) return;

    setLogs([]);
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [deploymentId, connect]);

  return { logs };
}
