'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Deployment, DeploymentLog } from '@/types/delivery';
import { triggerDeploy, fetchDeployments } from '@/lib/delivery-api';
import { useDeploymentWebSocket } from '@/hooks/useDeploymentWebSocket';

interface DeployConsoleProps {
  taskId: string;
}

const DEPLOYMENTS_STORAGE_KEY = 'devpilot_deployments';

export function DeployConsole({ taskId }: DeployConsoleProps) {
  const [platform, setPlatform] = useState<'vercel' | 'render'>('vercel');
  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(null);
  const [history, setHistory] = useState<Deployment[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);

  const { logs } = useDeploymentWebSocket(taskId, currentDeployment?.id || null);

  useEffect(() => {
    const stored = localStorage.getItem(`${DEPLOYMENTS_STORAGE_KEY}_${taskId}`);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
    fetchDeployments(taskId)
      .then((deploys) => {
        setHistory(deploys.slice(0, 10));
      })
      .catch(() => {
        // ignore
      });
  }, [taskId]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const handleDeploy = async () => {
    if (isDeploying) return;
    setIsDeploying(true);
    try {
      const deployment = await triggerDeploy(taskId, platform, 'frontend');
      setCurrentDeployment(deployment);
    } catch (e) {
      console.error('Deploy failed:', e);
    } finally {
      setIsDeploying(false);
    }
  };

  const getStatusBadge = (status: Deployment['status']) => {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      idle: 'default',
      deploying: 'info',
      success: 'success',
      failed: 'danger',
    };
    const labels: Record<string, string> = {
      idle: '空闲',
      deploying: '部署中',
      success: '成功',
      failed: '失败',
    };
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  const getDeployButton = () => {
    if (isDeploying || currentDeployment?.status === 'deploying') {
      return (
        <Button variant="secondary" disabled>
          <span className="animate-spin mr-2">⏳</span>
          部署中...
        </Button>
      );
    }
    if (currentDeployment?.status === 'success') {
      return (
        <Button
          variant="primary"
          onClick={() => window.open(currentDeployment.preview_url, '_blank')}
        >
          🚀 查看预览
        </Button>
      );
    }
    if (currentDeployment?.status === 'failed') {
      return (
        <Button variant="danger" onClick={handleDeploy}>
          重新部署
        </Button>
      );
    }
    return (
      <Button variant="primary" onClick={handleDeploy}>
        🚀 部署预览
      </Button>
    );
  };

  const status = currentDeployment?.status || 'idle';

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900">🚀 部署控制台</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPlatform('vercel')}
              className={`px-3 py-1 text-sm rounded ${
                platform === 'vercel'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              前端 Vercel
            </button>
            <button
              onClick={() => setPlatform('render')}
              className={`px-3 py-1 text-sm rounded ${
                platform === 'render'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              后端 Render
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-600">状态：</span>
          {getStatusBadge(status)}
          {currentDeployment?.commit_sha && (
            <code className="text-xs text-gray-500">
              {currentDeployment.commit_sha.slice(0, 7)}
            </code>
          )}
        </div>

        <div
          ref={logsRef}
          className="bg-gray-900 text-gray-100 rounded p-4 h-48 overflow-y-auto font-mono text-sm"
        >
          {logs.length === 0 && (
            <div className="text-gray-500">
              {isDeploying ? '等待部署日志...' : '暂无日志'}
            </div>
          )}
          {logs.map((log, i) => (
            <div
              key={i}
              className={`${
                log.level === 'error'
                  ? 'text-red-400'
                  : log.level === 'success'
                  ? 'text-green-400'
                  : 'text-gray-300'
              }`}
            >
              <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-200">
        <div className="flex items-center gap-3">{getDeployButton()}</div>
      </div>

      {history.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200">
          <span className="text-sm font-medium text-gray-700">历史部署</span>
          <div className="mt-2 space-y-2">
            {history.slice(0, 10).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between py-1 text-sm"
              >
                <div className="flex items-center gap-2">
                  {getStatusBadge(d.status)}
                  <code className="text-xs text-gray-500">{d.commit_sha.slice(0, 7)}</code>
                  <span className="text-xs text-gray-400">
                    {new Date(d.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
                {d.status === 'success' && (
                  <button
                    onClick={() => window.open(d.preview_url, '_blank')}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    预览
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
