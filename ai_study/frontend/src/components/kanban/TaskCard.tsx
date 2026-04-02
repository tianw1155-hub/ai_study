"use client";

import { Task, TaskType, Priority } from '@/types/task';
import { Badge } from '@/components/ui/Badge';
import { useKanbanStore } from '@/lib/kanban-store';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

const typeLabels: Record<TaskType, string> = {
  code: '代码',
  test: '测试',
  deploy: '部署',
  document: '文档',
};

const typeColors: Record<TaskType, BadgeProps['variant']> = {
  code: 'info',
  test: 'warning',
  deploy: 'success',
  document: 'default',
};

const priorityColors: Record<Priority, string> = {
  high: 'border-l-4 border-red-500',
  medium: 'border-l-4 border-yellow-500',
  low: 'border-l-4 border-gray-300',
};

const priorityLabels: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

type BadgeProps = {
  variant?: "default" | "success" | "warning" | "danger" | "info";
};

function formatDuration(seconds: number): string {
  if (seconds === 0) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { setSelectedTask, setDrawerOpen } = useKanbanStore();

  const handleClick = () => {
    setSelectedTask(task.id);
    setDrawerOpen(true);
    onClick?.();
  };

  const isUnknown = task.agent_type === 'unknown';
  const isCancelled = task.state === 'cancelled';

  return (
    <div
      onClick={handleClick}
      className={`
        bg-gray-900 rounded-lg shadow-sm border border-gray-800 p-3 cursor-pointer
        transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-700
        ${priorityColors[task.priority]}
        ${isCancelled ? 'opacity-60' : ''}
      `}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      {/* 标题 */}
      <h4 
        className="text-sm font-medium text-gray-100 line-clamp-2 mb-2"
        title={task.title}
      >
        {task.title}
      </h4>

      {/* 类型标签 */}
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={typeColors[task.type]}>
          {typeLabels[task.type]}
        </Badge>
        
        {/* 优先级 */}
        <span className={`
          text-xs px-1.5 py-0.5 rounded
          ${task.priority === 'high' ? 'text-red-400 bg-red-500/10' : ''}
          ${task.priority === 'medium' ? 'text-yellow-400 bg-yellow-500/10' : ''}
          ${task.priority === 'low' ? 'text-gray-400 bg-gray-500/10' : ''}
        `}>
          {priorityLabels[task.priority]}
        </span>
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        {/* 耗时 */}
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {task.actual_duration > 0 ? formatDuration(task.actual_duration) : formatDuration(task.estimated_duration)}
        </span>

        {/* 分配者 */}
        {isUnknown ? (
          <span className="text-red-500 font-medium">未分配</span>
        ) : (
          <span className="truncate max-w-[80px]" title={task.assignee}>
            {task.assignee || '-'}
          </span>
        )}
      </div>

      {/* 重试标记 */}
      {task.retry_count > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-orange-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重试 {task.retry_count} 次
        </div>
      )}
    </div>
  );
}

export default TaskCard;
