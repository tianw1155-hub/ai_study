"use client";

import { Task, TaskState } from '@/types/task';
import { useKanbanStore } from '@/lib/kanban-store';
import TaskCard from './TaskCard';

interface KanbanBoardProps {
  tasks: Task[];
}

// 列配置
const columns: {
  id: TaskState;
  title: string;
  color: string;
  bgColor: string;
  textColor: string;
  states: TaskState[];
}[] = [
  {
    id: 'pending',
    title: '待处理',
    color: '#9CA3AF',
    bgColor: 'bg-gray-400',
    textColor: 'text-gray-600',
    states: ['pending'],
  },
  {
    id: 'running',
    title: '处理中',
    color: '#3B82F6',
    bgColor: 'bg-blue-500',
    textColor: 'text-blue-600',
    states: ['running'],
  },
  {
    id: 'testing',
    title: '测试中',
    color: '#F59E0B',
    bgColor: 'bg-yellow-500',
    textColor: 'text-yellow-600',
    states: ['testing'],
  },
  {
    id: 'completed',
    title: '已完成',
    color: '#10B981',
    bgColor: 'bg-green-500',
    textColor: 'text-green-600',
    states: ['passed', 'completed'],
  },
  {
    id: 'failed',
    title: '已失败',
    color: '#EF4444',
    bgColor: 'bg-red-500',
    textColor: 'text-red-600',
    states: ['failed'],
  },
];

export function KanbanBoard({ tasks }: KanbanBoardProps) {
  const {
    filterType,
    filterState,
    filterPriority,
    filterAssignee,
    showCancelled,
    mobileActiveColumn,
    setMobileActiveColumn,
  } = useKanbanStore();

  // 筛选任务
  const filteredTasks = tasks.filter(task => {
    // 过滤 cancelled
    if (task.state === 'cancelled' && !showCancelled) {
      return false;
    }

    // 类型筛选
    if (filterType.length > 0 && !filterType.includes(task.type)) {
      return false;
    }

    // 状态筛选
    if (filterState.length > 0 && !filterState.includes(task.state)) {
      return false;
    }

    // 优先级筛选
    if (filterPriority.length > 0 && !filterPriority.includes(task.priority)) {
      return false;
    }

    // 分配者筛选
    if (filterAssignee) {
      if (filterAssignee === 'unassigned') {
        if (task.assignee) return false;
      } else if (task.assignee !== filterAssignee) {
        return false;
      }
    }

    return true;
  });

  // 按列分组
  const tasksByColumn = columns.reduce((acc, col) => {
    acc[col.id] = filteredTasks.filter(task => col.states.includes(task.state));
    return acc;
  }, {} as Record<TaskState, Task[]>);

  // Desktop/Tablet 布局
  // PRD 5.2: Desktop (≥1280px) 5列平铺, Tablet (768-1279px) 3列可见横向滚动
  const renderDesktopBoard = () => (
    <div className="hidden lg:grid grid-cols-3 xl:grid-cols-5 gap-4 overflow-x-auto pb-4">
      {columns.map(col => (
        <div key={col.id} className="flex flex-col min-w-[240px]">
          {/* 列头 */}
          <div className={`
            flex items-center justify-between px-3 py-2 rounded-t-lg
            ${col.bgColor.replace('bg-', 'bg-opacity-20 bg-')}
          `}
          style={{ backgroundColor: col.color + '20' }}
          >
            <h3 className={`font-semibold text-sm ${col.textColor}`}>
              {col.title}
            </h3>
            <span 
              className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                text-white
              `}
              style={{ backgroundColor: col.color }}
            >
              {tasksByColumn[col.id]?.length || 0}
            </span>
          </div>

          {/* 任务列表 */}
          <div className="flex-1 space-y-2 p-2 bg-gray-900/50 rounded-b-lg min-h-[200px]">
            {tasksByColumn[col.id] && tasksByColumn[col.id].length > 0 ? (
              tasksByColumn[col.id].map(task => (
                <TaskCard key={task.id} task={task} />
              ))
            ) : (
              <div className="flex items-center justify-center h-24 text-gray-500 text-sm">
                暂无任务
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // Mobile Tab 切换布局 (<768px)
  const renderMobileBoard = () => {
    const activeColumn = columns.find(col => col.id === mobileActiveColumn);
    
    return (
      <div className="lg:hidden">
        {/* Tab 切换 */}
        <div className="flex overflow-x-auto gap-2 pb-2 mb-4 scrollbar-hide">
          {columns.map(col => (
            <button
              key={col.id}
              onClick={() => setMobileActiveColumn(col.id)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                whitespace-nowrap transition-colors
                ${mobileActiveColumn === col.id ? 'ring-2' : 'opacity-70'}
              `}
              style={{ 
                backgroundColor: col.color + '20',
                color: col.color.replace('bg-', '').replace('-500', '-600'),
                ...(mobileActiveColumn === col.id ? { ringColor: col.color } : {}),
              }}
            >
              {col.title}
              <span 
                className="px-1.5 py-0.5 rounded-full text-white text-xs"
                style={{ backgroundColor: col.color }}
              >
                {tasksByColumn[col.id]?.length || 0}
              </span>
            </button>
          ))}
        </div>

        {/* 当前列任务 */}
        <div className="space-y-2">
          {activeColumn && tasksByColumn[activeColumn.id]?.length > 0 ? (
            tasksByColumn[activeColumn.id].map(task => (
              <TaskCard key={task.id} task={task} />
            ))
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm bg-gray-900/50 rounded-lg border border-gray-800">
              暂无任务
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {renderDesktopBoard()}
      {renderMobileBoard()}
    </div>
  );
}

export default KanbanBoard;
