"use client";

import { useState, useRef, useEffect } from 'react';
import { useKanbanStore } from '@/lib/kanban-store';
import { Task, TaskType, TaskState, Priority } from '@/types/task';
import { Badge } from '@/components/ui/Badge';

interface KanbanFiltersProps {
  tasks: Task[];
  onStateClick?: (state: TaskState) => void;
}

const typeOptions: { value: TaskType; label: string }[] = [
  { value: 'code', label: '代码' },
  { value: 'test', label: '测试' },
  { value: 'deploy', label: '部署' },
  { value: 'document', label: '文档' },
];

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const stateColors: Record<TaskState, string> = {
  pending: 'bg-gray-400',
  running: 'bg-blue-500',
  testing: 'bg-yellow-500',
  passed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-300',
  completed: 'bg-green-600',
};

const stateLabels: Record<TaskState, string> = {
  pending: '待处理',
  running: '处理中',
  testing: '测试中',
  passed: '已通过',
  failed: '已失败',
  cancelled: '已取消',
  completed: '已完成',
};

export function KanbanFilters({ tasks, onStateClick }: KanbanFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    filterType,
    filterState,
    filterPriority,
    filterAssignee,
    showCancelled,
    setFilterType,
    setFilterState,
    setFilterPriority,
    setFilterAssignee,
    setShowCancelled,
    resetFilters,
  } = useKanbanStore();

  // 统计数据
  const stats = {
    total: tasks.filter(t => t.state !== 'cancelled' || showCancelled).length,
    pending: tasks.filter(t => t.state === 'pending').length,
    running: tasks.filter(t => t.state === 'running').length,
    testing: tasks.filter(t => t.state === 'testing').length,
    completed: tasks.filter(t => t.state === 'passed' || t.state === 'completed').length,
    failed: tasks.filter(t => t.state === 'failed').length,
  };

  // 分配者列表
  const assignees = Array.from(
    new Set(tasks.map(t => t.assignee).filter(Boolean))
  );

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const hasActiveFilters = 
    filterType.length > 0 ||
    filterState.length > 0 ||
    filterPriority.length > 0 ||
    filterAssignee !== null ||
    showCancelled;

  return (
    <div className="mb-4" ref={dropdownRef}>
      {/* 顶部快捷标签 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">
          汇总: <span className="font-medium text-gray-900">{stats.total}</span> 任务
        </span>
        
        <div className="w-px h-4 bg-gray-300" />
        
        {/* 状态快捷标签 */}
        {[
          { state: 'pending' as TaskState, count: stats.pending },
          { state: 'running' as TaskState, count: stats.running },
          { state: 'testing' as TaskState, count: stats.testing },
          { state: 'passed' as TaskState, count: stats.completed, label: '已完成' },
          { state: 'failed' as TaskState, count: stats.failed },
        ].map(({ state, count, label }) => (
          <button
            key={state}
            onClick={() => onStateClick?.(state)}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
              transition-colors hover:opacity-80
              ${filterState.includes(state) ? 'ring-2 ring-offset-1' : ''}
            `}
            style={{ 
              backgroundColor: stateColors[state] + '20',
              color: stateColors[state].replace('bg-', '').replace('-500', '-600'),
            }}
          >
            <span 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: stateColors[state] }}
            />
            {label || stateLabels[state]}
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: stateColors[state] }}>
              {count}
            </span>
          </button>
        ))}

        <div className="flex-1" />

        {/* 筛选按钮 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
            transition-colors
            ${hasActiveFilters 
              ? 'bg-brand-blue text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
          `}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          筛选
          {hasActiveFilters && (
            <span className="w-5 h-5 rounded-full bg-white text-brand-blue text-xs flex items-center justify-center">
              !
            </span>
          )}
        </button>

        {/* 重置按钮 */}
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            重置
          </button>
        )}
      </div>

      {/* 下拉面板 */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
          {/* 任务类型 */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">任务类型</h4>
            <div className="flex flex-wrap gap-2">
              {typeOptions.map(opt => (
                <label key={opt.value} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterType.includes(opt.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFilterType([...filterType, opt.value]);
                      } else {
                        setFilterType(filterType.filter(t => t !== opt.value));
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                  />
                  <span className="text-sm text-gray-600">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 优先级 */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">优先级</h4>
            <div className="flex flex-wrap gap-2">
              {priorityOptions.map(opt => (
                <label key={opt.value} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterPriority.includes(opt.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFilterPriority([...filterPriority, opt.value]);
                      } else {
                        setFilterPriority(filterPriority.filter(p => p !== opt.value));
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                  />
                  <span className="text-sm text-gray-600">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 分配者 */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">分配者</h4>
            <select
              value={filterAssignee || ''}
              onChange={(e) => setFilterAssignee(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="">全部</option>
              <option value="unassigned">未分配</option>
              {assignees.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* 显示已取消 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-cancelled"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
            />
            <label htmlFor="show-cancelled" className="text-sm text-gray-600 cursor-pointer">
              显示已取消
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default KanbanFilters;
