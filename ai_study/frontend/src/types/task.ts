/**
 * Task 类型定义
 * 
 * 对应 PRD-任务看板 v0.4 规范
 */

export type TaskType = 'code' | 'test' | 'deploy' | 'document';
export type AgentType = 'coder' | 'tester' | 'deployer' | 'planner' | 'unknown';
export type Priority = 'high' | 'medium' | 'low';
export type TaskState = 'pending' | 'running' | 'testing' | 'passed' | 'failed' | 'cancelled' | 'completed';

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  agent_type: AgentType;
  priority: Priority;
  state: TaskState;
  assignee: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
  estimated_duration: number;
  actual_duration: number;
  retry_count: number;
  version: number;
}

export interface TaskLog {
  timestamp: string;
  level: 'INFO' | 'DEBUG' | 'ERROR' | 'WARN';
  agent: string;
  message: string;
  stack?: string;
}

/**
 * 任务详情（包含日志和输入输出）
 */
export interface TaskDetail extends Task {
  input?: string;
  output?: string;
  logs: TaskLog[];
}

/**
 * Mock 数据生成函数
 */
export function generateMockTasks(): Task[] {
  return [
    {
      id: 'task_001',
      title: '生成用户登录 API（POST /api/auth/login）',
      type: 'code',
      agent_type: 'coder',
      priority: 'high',
      state: 'pending',
      assignee: 'Agent_Coder_v2',
      created_at: '2026-03-28T19:30:00Z',
      updated_at: '2026-03-28T19:30:00Z',
      estimated_duration: 30,
      actual_duration: 0,
      retry_count: 0,
      version: 1,
    },
    {
      id: 'task_002',
      title: '实现 JWT Token 刷新机制',
      type: 'code',
      agent_type: 'coder',
      priority: 'medium',
      state: 'running',
      assignee: 'Agent_Coder_v2',
      created_at: '2026-03-28T19:32:00Z',
      updated_at: '2026-03-28T19:35:00Z',
      estimated_duration: 45,
      actual_duration: 15,
      retry_count: 0,
      version: 2,
    },
    {
      id: 'task_003',
      title: '用户注册接口单元测试',
      type: 'test',
      agent_type: 'tester',
      priority: 'high',
      state: 'pending',
      assignee: 'Agent_Tester_v1',
      created_at: '2026-03-28T19:28:00Z',
      updated_at: '2026-03-28T19:28:00Z',
      estimated_duration: 60,
      actual_duration: 0,
      retry_count: 0,
      version: 1,
    },
    {
      id: 'task_004',
      title: '登录接口性能测试（100并发）',
      type: 'test',
      agent_type: 'tester',
      priority: 'medium',
      state: 'testing',
      assignee: 'Agent_Tester_v1',
      created_at: '2026-03-28T19:25:00Z',
      updated_at: '2026-03-28T19:40:00Z',
      estimated_duration: 120,
      actual_duration: 45,
      retry_count: 0,
      version: 3,
    },
    {
      id: 'task_005',
      title: '生产环境 K8s 部署配置',
      type: 'deploy',
      agent_type: 'deployer',
      priority: 'high',
      state: 'pending',
      assignee: 'Agent_Deployer_v1',
      created_at: '2026-03-28T19:20:00Z',
      updated_at: '2026-03-28T19:20:00Z',
      estimated_duration: 90,
      actual_duration: 0,
      retry_count: 0,
      version: 1,
    },
    {
      id: 'task_006',
      title: 'API 接口文档生成',
      type: 'document',
      agent_type: 'planner',
      priority: 'low',
      state: 'completed',
      assignee: 'Agent_Planner_v1',
      created_at: '2026-03-28T18:00:00Z',
      updated_at: '2026-03-28T19:00:00Z',
      estimated_duration: 30,
      actual_duration: 25,
      retry_count: 0,
      version: 4,
    },
    {
      id: 'task_007',
      title: '数据库索引优化查询',
      type: 'code',
      agent_type: 'coder',
      priority: 'medium',
      state: 'passed',
      assignee: 'Agent_Coder_v3',
      created_at: '2026-03-28T17:30:00Z',
      updated_at: '2026-03-28T18:45:00Z',
      estimated_duration: 40,
      actual_duration: 38,
      retry_count: 1,
      version: 5,
    },
    {
      id: 'task_008',
      title: 'Redis 缓存集成测试',
      type: 'test',
      agent_type: 'tester',
      priority: 'high',
      state: 'failed',
      assignee: 'Agent_Tester_v2',
      created_at: '2026-03-28T17:00:00Z',
      updated_at: '2026-03-28T18:30:00Z',
      estimated_duration: 50,
      actual_duration: 60,
      retry_count: 2,
      version: 6,
    },
    {
      id: 'task_009',
      title: 'CDN 静态资源部署',
      type: 'deploy',
      agent_type: 'deployer',
      priority: 'low',
      state: 'pending',
      assignee: 'Agent_Deployer_v1',
      created_at: '2026-03-28T16:00:00Z',
      updated_at: '2026-03-28T16:00:00Z',
      estimated_duration: 20,
      actual_duration: 0,
      retry_count: 0,
      version: 1,
    },
    {
      id: 'task_010',
      title: 'OAuth2 第三方登录集成',
      type: 'code',
      agent_type: 'unknown',
      priority: 'high',
      state: 'pending',
      assignee: '',
      created_at: '2026-03-28T15:30:00Z',
      updated_at: '2026-03-28T15:30:00Z',
      estimated_duration: 120,
      actual_duration: 0,
      retry_count: 0,
      version: 1,
    },
    {
      id: 'task_011',
      title: '支付模块代码审查',
      type: 'code',
      agent_type: 'coder',
      priority: 'medium',
      state: 'cancelled',
      assignee: 'Agent_Coder_v2',
      created_at: '2026-03-28T14:00:00Z',
      updated_at: '2026-03-28T14:30:00Z',
      estimated_duration: 60,
      actual_duration: 0,
      retry_count: 0,
      version: 2,
    },
    {
      id: 'task_012',
      title: '日志采集服务部署',
      type: 'deploy',
      agent_type: 'deployer',
      priority: 'medium',
      state: 'running',
      assignee: 'Agent_Deployer_v2',
      created_at: '2026-03-28T13:00:00Z',
      updated_at: '2026-03-28T14:00:00Z',
      estimated_duration: 45,
      actual_duration: 30,
      retry_count: 0,
      version: 3,
    },
  ];
}

export default Task;
