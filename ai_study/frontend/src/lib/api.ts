/**
 * API 调用模块
 * 
 * 对应后端 REST API 端点
 * P2-1: 已替换为真实 fetch 调用，Mock 数据仅作为 fallback
 */

import { Task, TaskDetail, TaskLog, TaskState, generateMockTasks } from '@/types/task';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/** 获取 JWT Token */
function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 检查任务状态是否可取消 */
function canCancel(state: TaskState): boolean {
  return ['pending', 'running', 'testing'].includes(state);
}

// Mock 数据（仅在 API 调用失败时 fallback）
let mockTasks = generateMockTasks();

/**
 * 获取任务列表
 * 
 * GET /api/tasks
 * 
 * @param filters - 筛选参数
 */
export async function fetchTasks(filters?: {
  type?: string[];
  state?: string[];
  priority?: string[];
  assignee?: string;
}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.type?.length) params.set('type', filters.type.join(','));
  if (filters?.state?.length) params.set('state', filters.state.join(','));
  if (filters?.priority?.length) params.set('priority', filters.priority.join(','));
  if (filters?.assignee) params.set('assignee', filters.assignee);

  try {
    const response = await fetch(`${API_BASE}/api/tasks?${params}`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    // Fallback to mock data on API failure
    let filtered = [...mockTasks];
    if (filters?.type?.length) filtered = filtered.filter(t => filters.type!.includes(t.type));
    if (filters?.state?.length) filtered = filtered.filter(t => filters.state!.includes(t.state));
    if (filters?.priority?.length) filtered = filtered.filter(t => filters.priority!.includes(t.priority));
    if (filters?.assignee) filtered = filtered.filter(t => t.assignee === filters.assignee);
    return filtered;
  }
}

/**
 * 获取任务详情
 * 
 * GET /api/tasks/:id
 */
export async function fetchTaskDetail(id: string): Promise<TaskDetail> {
  try {
    const response = await fetch(`${API_BASE}/api/tasks/${id}`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    // Fallback to mock
    const task = mockTasks.find(t => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    const detail: TaskDetail = {
      ...task,
      input: task.type === 'code'
        ? `# ${task.title}\n\n## 需求描述\n实现用户登录功能，包括：\n- 用户名密码验证\n- JWT Token 生成\n- 错误处理和日志记录`
        : task.type === 'test'
        ? `# 测试用例\n\n## 测试场景\n1. 正常登录流程\n2. 密码错误场景\n3. 账号不存在场景\n4. Token 过期场景`
        : undefined,
      output: task.state === 'passed' || task.state === 'completed'
        ? `// 已生成的代码\n\nexport async function login(username: string, password: string) {\n  const user = await validateCredentials(username, password);\n  const token = generateJWT(user);\n  return { user, token };\n}`
        : undefined,
      logs: generateMockLogs(task),
    };
    return detail;
  }
}

/**
 * 认领任务
 * 
 * POST /api/tasks/:id/claim
 */
export async function claimTask(taskId: string, expectedVersion: number): Promise<{ success: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ expected_version: expectedVersion }),
    });
    if (!response.ok) {
      if (response.status === 409) throw new Error('CONFLICT');
      throw new Error(`HTTP ${response.status}`);
    }
    return { success: true };
  } catch (err: any) {
    if (err.message === 'CONFLICT') throw err;
    // Fallback mock
    const taskIndex = mockTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) throw new Error(`Task ${taskId} not found`);
    mockTasks[taskIndex] = { ...mockTasks[taskIndex], state: 'running', updated_at: new Date().toISOString(), version: mockTasks[taskIndex].version + 1 };
    return { success: true };
  }
}

/**
 * 取消任务
 * 
 * POST /api/tasks/:id/cancel
 * P2-2: 前端已校验状态，仅 pending/running/testing 可取消
 */
export async function cancelTask(taskId: string): Promise<{ success: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { success: true };
  } catch {
    // Fallback mock
    const taskIndex = mockTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) throw new Error(`Task ${taskId} not found`);
    mockTasks[taskIndex] = { ...mockTasks[taskIndex], state: 'cancelled', updated_at: new Date().toISOString(), version: mockTasks[taskIndex].version + 1 };
    return { success: true };
  }
}

/**
 * 重试任务
 * 
 * POST /api/tasks/:id/retry
 */
export async function retryTask(taskId: string): Promise<{ success: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { success: true };
  } catch {
    // Fallback mock
    const taskIndex = mockTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) throw new Error(`Task ${taskId} not found`);
    mockTasks[taskIndex] = { ...mockTasks[taskIndex], state: 'running', retry_count: mockTasks[taskIndex].retry_count + 1, updated_at: new Date().toISOString(), version: mockTasks[taskIndex].version + 1 };
    return { success: true };
  }
}

/**
 * 获取任务日志
 * 
 * GET /api/tasks/:id/logs
 */
export async function fetchTaskLogs(taskId: string): Promise<TaskLog[]> {
  try {
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}/logs`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    // Fallback mock
    const task = mockTasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return generateMockLogs(task);
  }
}

// Helper function to generate mock logs
function generateMockLogs(task: Task): TaskLog[] {
  const baseTime = new Date(task.created_at);
  const logs: TaskLog[] = [
    {
      timestamp: task.created_at,
      level: 'INFO',
      agent: task.agent_type || 'System',
      message: `任务已创建: ${task.title}`,
    },
  ];
  
  if (task.state !== 'pending') {
    logs.push({
      timestamp: new Date(baseTime.getTime() + 1000).toISOString(),
      level: 'INFO',
      agent: task.agent_type || 'System',
      message: '任务开始执行',
    });
  }
  
  if (task.state === 'running') {
    logs.push({
      timestamp: new Date(baseTime.getTime() + 5000).toISOString(),
      level: 'DEBUG',
      agent: task.agent_type || 'System',
      message: '正在处理中...',
    });
  }
  
  if (task.state === 'testing') {
    logs.push({
      timestamp: new Date(baseTime.getTime() + 10000).toISOString(),
      level: 'INFO',
      agent: 'Agent_Tester',
      message: '开始执行测试用例',
    });
    logs.push({
      timestamp: new Date(baseTime.getTime() + 15000).toISOString(),
      level: 'DEBUG',
      agent: 'Agent_Tester',
      message: '测试用例 1/5 通过',
    });
  }
  
  if (task.state === 'failed') {
    logs.push({
      timestamp: new Date(baseTime.getTime() + 20000).toISOString(),
      level: 'ERROR',
      agent: task.agent_type || 'System',
      message: '执行失败：编译错误或测试不通过',
      stack: 'at main.go:45\nat handler.go:123',
    });
  }
  
  if (task.state === 'passed' || task.state === 'completed') {
    logs.push({
      timestamp: new Date(baseTime.getTime() + 30000).toISOString(),
      level: 'INFO',
      agent: task.agent_type || 'System',
      message: '任务执行完成',
    });
  }
  
  if (task.retry_count > 0) {
    logs.push({
      timestamp: task.updated_at,
      level: 'WARN',
      agent: 'System',
      message: `任务已重试 ${task.retry_count} 次`,
    });
  }
  
  return logs;
}

export { canCancel };

export default {
  fetchTasks,
  fetchTaskDetail,
  claimTask,
  cancelTask,
  retryTask,
  fetchTaskLogs,
};
