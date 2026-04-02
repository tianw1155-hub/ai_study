import { create } from "zustand"

/**
 * 用户模型配置（登录时由用户自己配置）
 */
export interface ModelConfig {
  model: string
  apiKey: string
}

/** 从 localStorage 读取模型配置 */
export function getModelConfig(): ModelConfig | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem("model_config")
  if (!raw) return null
  try {
    return JSON.parse(raw) as ModelConfig
  } catch {
    return null
  }
}

// ============================================
// 占位类型定义 - 根据实际业务需求完善
// ============================================

// interface User {
//   id: string;
//   name: string;
//   email: string;
//   role: 'admin' | 'developer' | 'tester';
// }

// interface Task {
//   id: string;
//   title: string;
//   status: 'pending' | 'running' | 'completed' | 'failed';
//   agent?: 'Planner' | 'Coder' | 'Tester' | 'Deployer';
// }

// ============================================
// Store 定义示例（根据需要启用）
// ============================================

/**
 * 应用全局 Store（占位）
 *
 * 用于管理：
 * - 用户登录状态
 * - 全局 UI 状态
 * - 主题设置
 */
interface AppStore {
  // user: User | null;
  // setUser: (user: User | null) => void;
  // isSidebarOpen: boolean;
  // toggleSidebar: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // user: null,
  // setUser: (user) => set({ user }),
  // isSidebarOpen: true,
  // toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
}));

/**
 * 任务 Store（占位）
 *
 * 用于管理：
 * - 任务列表
 * - 任务筛选
 * - 实时任务状态
 */
interface TaskStore {
  // tasks: Task[];
  // addTask: (task: Task) => void;
  // updateTask: (id: string, updates: Partial<Task>) => void;
  // removeTask: (id: string) => void;
  // filter: 'all' | 'pending' | 'running' | 'completed' | 'failed';
  // setFilter: (filter: TaskStore['filter']) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  // tasks: [],
  // addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  // updateTask: (id, updates) => set((state) => ({
  //   tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  // })),
  // removeTask: (id) => set((state) => ({
  //   tasks: state.tasks.filter((t) => t.id !== id),
  // })),
  // filter: 'all',
  // setFilter: (filter) => set({ filter }),
}));

/**
 * WebSocket 连接状态 Store（占位）
 *
 * 用于管理：
 * - 连接状态
 * - 最后心跳时间
 * - 实时消息队列
 */
interface WSStore {
  // isConnected: boolean;
  // lastHeartbeat: number | null;
  // messages: WebSocketMessage[];
  // connect: () => void;
  // disconnect: () => void;
  // addMessage: (message: WebSocketMessage) => void;
  // clearMessages: () => void;
}

export const useWSStore = create<WSStore>((set) => ({
  // isConnected: false,
  // lastHeartbeat: null,
  // messages: [],
  // connect: () => set({ isConnected: true }),
  // disconnect: () => set({ isConnected: false }),
  // addMessage: (message) => set((state) => ({
  //   messages: [...state.messages, message].slice(-100), // 保留最近 100 条
  // })),
  // clearMessages: () => set({ messages: [] }),
}));

export default useAppStore;
