"use client";

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useKanbanStore, KanbanActiveTab } from '@/lib/kanban-store';
import { fetchTaskDetail, cancelTask, retryTask, canCancel } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TaskState, Priority } from '@/types/task';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

function GeneratedOutput({ taskId }: { taskId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['task-output', taskId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/output`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to load output');
      }
      return res.text();
    },
    refetchInterval: (query) => {
      // Poll until output is available (every 3s)
      return query.state.data === undefined && query.state.status === 'success' ? false : 3000;
    },
    enabled: !!taskId,
  });

  if (isLoading) {
    return (
      <div className="mt-4 border-t border-gray-800 pt-4">
        <div className="text-xs text-gray-500 mb-2">🤖 AI 生成的代码</div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          正在生成代码，请稍候...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 border-t border-gray-800 pt-4">
        <div className="text-xs text-gray-500 mb-2">🤖 AI 生成的代码</div>
        <div className="text-xs text-gray-500">代码生成中...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-4 border-t border-gray-800 pt-4">
        <div className="text-xs text-gray-500 mb-2">🤖 AI 生成的代码</div>
        <div className="text-xs text-gray-500">等待生成...</div>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-gray-800 pt-4">
      <div className="text-xs text-gray-500 mb-3">🤖 AI 生成的代码</div>
      <div className="prose prose-invert prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {data}
        </ReactMarkdown>
      </div>
    </div>
  );
}

const stateLabels: Record<TaskState, string> = {
  pending: '待处理',
  running: '处理中',
  testing: '测试中',
  passed: '已通过',
  failed: '已失败',
  cancelled: '已取消',
  completed: '已完成',
};

const stateColors: Record<TaskState, BadgeProps['variant']> = {
  pending: 'default',
  running: 'info',
  testing: 'warning',
  passed: 'success',
  failed: 'danger',
  cancelled: 'default',
  completed: 'success',
};

const priorityLabels: Record<Priority, string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
};

type BadgeProps = {
  variant?: "default" | "success" | "warning" | "danger" | "info";
};

function formatDuration(seconds: number): string {
  if (seconds === 0) return '-';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes} 分 ${remainingSeconds} 秒` : `${minutes} 分钟`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TaskDrawer() {
  const router = useRouter();
  const {
    selectedTaskId,
    drawerOpen,
    activeTab,
    setDrawerOpen,
    setActiveTab,
  } = useKanbanStore();

  const { data: taskDetail, isLoading } = useQuery({
    queryKey: ['task', selectedTaskId],
    queryFn: () => fetchTaskDetail(selectedTaskId!),
    enabled: !!selectedTaskId && drawerOpen,
  });

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen, setDrawerOpen]);

  // 禁止背景滚动
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const handleCancel = useCallback(async () => {
    if (!selectedTaskId || !taskDetail) return;
    if (!canCancel(taskDetail.state)) {
      alert('当前状态不允许取消任务');
      return;
    }
    try {
      await cancelTask(selectedTaskId);
      setDrawerOpen(false);
    } catch (error) {
      console.error('Failed to cancel task:', error);
    }
  }, [selectedTaskId, taskDetail, setDrawerOpen]);

  const handleRetry = useCallback(async () => {
    if (!selectedTaskId) return;
    try {
      await retryTask(selectedTaskId);
      setDrawerOpen(false);
    } catch (error) {
      console.error('Failed to retry task:', error);
    }
  }, [selectedTaskId, setDrawerOpen]);

  // 运行测试
  const [isTesting, setIsTesting] = useState(false);
  const handleRunTest = useCallback(async () => {
    if (!selectedTaskId) return;
    setIsTesting(true);
    try {
      const result = await testTask(selectedTaskId);
      if (result.success) {
        if (result.test_result === 'passed') {
          setDrawerOpen(false);
        } else {
          // Test failed, task went back to running - stay open to show feedback
        }
      }
    } catch (error) {
      console.error('Failed to run test:', error);
    } finally {
      setIsTesting(false);
    }
  }, [selectedTaskId, setDrawerOpen]);

  const tabs: { id: KanbanActiveTab; label: string }[] = [
    { id: 'overview', label: '概述' },
    { id: 'input', label: '输入' },
    { id: 'output', label: '输出' },
    { id: 'logs', label: '日志' },
  ];

  if (!drawerOpen) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div 
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={() => setDrawerOpen(false)}
      />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[min(480px,50vw)] bg-gray-900 shadow-xl z-50 flex flex-col animate-slide-in border-l border-gray-700">
        {/* 头部 */}
        <div className="flex items-start justify-between p-4 border-b border-gray-700">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white truncate pr-4">
              {taskDetail?.title || '加载中...'}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {taskDetail && (
                <>
                  <Badge variant={stateColors[taskDetail.state]}>
                    {stateLabels[taskDetail.state]}
                  </Badge>
                  <Badge variant={
                    taskDetail.priority === 'high' ? 'danger' :
                    taskDetail.priority === 'medium' ? 'warning' : 'default'
                  }>
                    {priorityLabels[taskDetail.priority]}
                  </Badge>
                </>
              )}
            </div>
          </div>
          
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab 导航 */}
        <div className="flex border-b border-gray-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-4 py-3 text-sm font-medium transition-colors relative
                ${activeTab === tab.id 
                  ? 'text-brand-blue' 
                  : 'text-gray-400 hover:text-gray-200'}
              `}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue" />
              )}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-gray-700 rounded w-3/4" />
              <div className="h-4 bg-gray-700 rounded w-1/2" />
              <div className="h-4 bg-gray-700 rounded w-5/6" />
            </div>
          ) : taskDetail ? (
            <>
              {/* 概述 Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-500">任务 ID</span>
                      <p className="text-sm font-mono text-gray-200">{taskDetail.id}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">任务类型</span>
                      <p className="text-sm text-gray-200">
                        {taskDetail.type === 'code' ? '代码' :
                         taskDetail.type === 'test' ? '测试' :
                         taskDetail.type === 'deploy' ? '部署' : '文档'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Agent 类型</span>
                      <p className={`text-sm ${taskDetail.agent_type === 'unknown' ? 'text-red-400' : 'text-gray-200'}`}>
                        {taskDetail.agent_type === 'unknown' ? '未分配' :
                         taskDetail.agent_type === 'coder' ? 'Coder' :
                         taskDetail.agent_type === 'tester' ? 'Tester' :
                         taskDetail.agent_type === 'deployer' ? 'Deployer' :
                         taskDetail.agent_type === 'planner' ? 'Planner' : taskDetail.agent_type}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">分配者</span>
                      <p className={`text-sm ${!taskDetail.assignee ? 'text-red-400' : 'text-gray-200'}`}>
                        {taskDetail.assignee || '未分配'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">创建时间</span>
                      <p className="text-sm text-gray-200">{formatDate(taskDetail.created_at)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">更新时间</span>
                      <p className="text-sm text-gray-200">{formatDate(taskDetail.updated_at)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">预估耗时</span>
                      <p className="text-sm text-gray-200">{formatDuration(taskDetail.estimated_duration)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">实际耗时</span>
                      <p className="text-sm text-gray-200">{formatDuration(taskDetail.actual_duration)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">重试次数</span>
                      <p className={`text-sm ${taskDetail.retry_count > 0 ? 'text-orange-400' : 'text-gray-200'}`}>
                        {taskDetail.retry_count} / 3
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 输入 Tab */}
              {activeTab === 'input' && (
                <div>
                  {taskDetail.input ? (
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-950 p-3 rounded-md overflow-x-auto">
                      {taskDetail.input}
                    </pre>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      暂无输入数据
                    </div>
                  )}
                </div>
              )}

              {/* 输出 Tab */}
              {activeTab === 'output' && (
                <div>
                  {taskDetail.output ? (
                    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-950 p-3 rounded-md overflow-x-auto">
                      {taskDetail.output}
                    </pre>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      暂无输出数据
                    </div>
                  )}
                  {/* AI 生成的代码输出 */}
                  {(taskDetail.state === 'completed' || taskDetail.state === 'failed') && (
                    <GeneratedOutput taskId={selectedTaskId!} />
                  )}
                </div>
              )}

              {/* 日志 Tab */}
              {activeTab === 'logs' && (
                <div className="space-y-2">
                  {taskDetail.logs && taskDetail.logs.length > 0 ? (
                    taskDetail.logs.map((log, index) => (
                      <div 
                        key={index}
                        className={`
                          p-2 rounded text-xs font-mono border
                          ${log.level === 'ERROR' ? 'bg-red-500/10 text-red-400 border-red-500/30' : ''}
                          ${log.level === 'WARN' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : ''}
                          ${log.level === 'DEBUG' ? 'bg-gray-800 text-gray-400 border-gray-700' : ''}
                          ${log.level === 'INFO' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : ''}
                        `}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">[{log.level}]</span>
                          <span className="text-gray-500">{log.agent}</span>
                          <span className="text-gray-500 ml-auto">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-gray-300">{log.message}</div>
                        {log.stack && (
                          <div className="mt-1 text-gray-500 whitespace-pre">
                            {log.stack}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      暂无日志数据
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-500 py-8">
              无法加载任务详情
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/80">
          <div className="flex gap-3">
            {/* 取消任务 - pending/running/testing */}
            {taskDetail && ['pending', 'running', 'testing'].includes(taskDetail.state) && (
              <Button
                variant="danger"
                className="border border-red-500 text-red-400 bg-red-500/10 hover:bg-red-500/20"
                onClick={handleCancel}
              >
                取消任务
              </Button>
            )}
            {/* 运行测试 */}
            {taskDetail && taskDetail.state === 'testing' && (
              <Button
                variant="primary"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleRunTest}
                disabled={isTesting}
              >
                {isTesting ? '⏳ 测试中...' : '▶ 运行测试'}
              </Button>
            )}

            {/* 重试任务 - failed 且 retryCount < 3 */}
            {taskDetail && taskDetail.state === 'failed' && taskDetail.retry_count < 3 && (
              <Button
                variant="primary"
                onClick={handleRetry}
              >
                重试任务
              </Button>
            )}

            {/* 查看代码 - passed/completed */}
            {taskDetail && ['passed', 'completed'].includes(taskDetail.state) && (
              <Button
                variant="primary"
                onClick={() => router.push(`/delivery?task_id=${taskDetail.id}`)}
              >
                查看代码
              </Button>
            )}

            {/* 复制日志 */}
            {taskDetail && activeTab === 'logs' && taskDetail.logs && taskDetail.logs.length > 0 && (
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={() => {
                  const logsText = taskDetail.logs
                    .map(l => `[${l.timestamp}] [${l.level}] ${l.agent}: ${l.message}`)
                    .join('\n');
                  navigator.clipboard.writeText(logsText);
                }}
              >
                复制日志
              </Button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 300ms ease-out;
        }
      `}</style>
    </>
  );
}

export default TaskDrawer;
