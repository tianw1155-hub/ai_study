/**
 * Kanban 看板状态管理
 * 
 * 使用 Zustand 管理看板 UI 状态：
 * - 选中任务
 * - 抽屉开关
 * - Tab 切换
 * - 筛选条件
 */

import { create } from 'zustand';
import { TaskType, TaskState, Priority } from '@/types/task';

export type KanbanActiveTab = 'overview' | 'input' | 'output' | 'logs';

interface KanbanStore {
  // 选中任务
  selectedTaskId: string | null;
  drawerOpen: boolean;
  activeTab: KanbanActiveTab;
  
  // 筛选
  filterType: TaskType[];
  filterState: TaskState[];
  filterPriority: Priority[];
  filterAssignee: string | null;
  showCancelled: boolean;
  
  // 排序
  sortBy: 'created_at' | 'updated_at' | 'priority';
  sortOrder: 'asc' | 'desc';
  
  // Mobile tab
  mobileActiveColumn: TaskState;
  
  // Actions
  setSelectedTask: (id: string | null) => void;
  setDrawerOpen: (open: boolean) => void;
  setActiveTab: (tab: KanbanActiveTab) => void;
  setFilterType: (types: TaskType[]) => void;
  setFilterState: (states: TaskState[]) => void;
  setFilterPriority: (priorities: Priority[]) => void;
  setFilterAssignee: (assignee: string | null) => void;
  setShowCancelled: (show: boolean) => void;
  setSortBy: (sort: 'created_at' | 'updated_at' | 'priority') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  setMobileActiveColumn: (column: TaskState) => void;
  resetFilters: () => void;
}

const initialState = {
  selectedTaskId: null,
  drawerOpen: false,
  activeTab: 'overview' as KanbanActiveTab,
  filterType: [] as TaskType[],
  filterState: [] as TaskState[],
  filterPriority: [] as Priority[],
  filterAssignee: null,
  showCancelled: false,
  sortBy: 'updated_at' as const,
  sortOrder: 'desc' as const,
  mobileActiveColumn: 'pending' as TaskState,
};

export const useKanbanStore = create<KanbanStore>((set) => ({
  ...initialState,
  
  setSelectedTask: (id) => set({ selectedTaskId: id }),
  
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  setFilterType: (types) => set({ filterType: types }),
  
  setFilterState: (states) => set({ filterState: states }),
  
  setFilterPriority: (priorities) => set({ filterPriority: priorities }),
  
  setFilterAssignee: (assignee) => set({ filterAssignee: assignee }),
  
  setShowCancelled: (show) => set({ showCancelled: show }),
  
  setSortBy: (sort) => set({ sortBy: sort }),
  
  setSortOrder: (order) => set({ sortOrder: order }),
  
  setMobileActiveColumn: (column) => set({ mobileActiveColumn: column }),
  
  resetFilters: () => set({
    filterType: [],
    filterState: [],
    filterPriority: [],
    filterAssignee: null,
    showCancelled: false,
  }),
}));

export default useKanbanStore;
