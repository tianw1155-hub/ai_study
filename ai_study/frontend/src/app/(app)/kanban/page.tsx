"use client";

import { useQuery } from '@tanstack/react-query';
import { KanbanBoard, TaskDrawer, KanbanFilters } from '@/components/kanban';
import { fetchTasks } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useKanbanStore } from '@/lib/kanban-store';
import { TaskState } from '@/types/task';

export default function KanbanPage() {
  const { setFilterState } = useKanbanStore();

  // 获取任务列表（按当前用户过滤）
  const userId = (() => {
    try {
      const user = localStorage.getItem('user')
      return user ? JSON.parse(user).login : undefined
    } catch { return undefined }
  })()

  const { data: tasks = [], isLoading, error, refetch } = useQuery({
    queryKey: ['tasks', userId],
    queryFn: () => fetchTasks({ userId }),
    refetchInterval: 30000, // 每 30 秒刷新一次
  });

  // WebSocket 实时更新
  useWebSocket({
    enabled: true,
    onTaskStateChanged: (taskId, fromState, toState) => {
      console.log(`Task ${taskId} moved from ${fromState} to ${toState}`);
      // React Query 会自动处理缓存更新
      refetch();
    },
  });

  // 处理状态标签点击（快速筛选）
  const handleStateClick = (state: TaskState) => {
    setFilterState([state]);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">任务看板</h1>
          <p className="mt-1 text-sm text-gray-400">
            实时查看所有任务状态，追踪开发进度
          </p>
        </div>

        {/* 筛选器 */}
        <KanbanFilters tasks={tasks} onStateClick={handleStateClick} />

        {/* 刷新按钮 */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors"
          >
            <svg 
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
          
          {error && (
            <span className="text-sm text-red-400">
              数据加载失败，请重试
            </span>
          )}
        </div>

        {/* 看板内容 */}
        {isLoading ? (
          <div className="animate-pulse">
            <div className="grid grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-10 bg-gray-800 rounded-lg" />
                  <div className="h-24 bg-gray-800 rounded-lg" />
                  <div className="h-24 bg-gray-800 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <KanbanBoard tasks={tasks} />
        )}
      </div>

      {/* 详情抽屉 */}
      <TaskDrawer />
    </div>
  );
}
