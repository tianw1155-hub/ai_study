/**
 * WebSocket 消息类型定义
 * 
 * 对应 PRD-首页 v0.5 统一 Schema（M2.2）
 * 用于实时任务状态同步和 Agent 协作通信
 * 
 * @see PRD-首页 M2.2 统一 Schema
 */

/**
 * WebSocket 消息事件类型
 */
export type WebSocketEvent =
  | 'task:started'      // 任务开始
  | 'task:progress'     // 任务进度更新
  | 'task:completed'    // 任务完成
  | 'task:failed'       // 任务失败
  | 'task:heartbeat'    // 任务心跳
  | 'task:state_changed'; // 任务状态变更

/**
 * Agent 类型
 */
export type AgentType = 'Planner' | 'Coder' | 'Tester' | 'Deployer';

/**
 * 任务状态
 */
export type TaskStatus = 'running' | 'success' | 'error';

/**
 * WebSocket 消息统一 Schema
 */
export interface WebSocketMessage {
  /** 事件类型 */
  event: WebSocketEvent;
  /** 任务 ID */
  taskId: string;
  /** 消息唯一 ID（可选） */
  id?: string;
  /** 时间戳 ISO 8601 格式（可选） */
  timestamp?: string;
  /** 执行操作的 Agent（可选） */
  agent?: AgentType;
  /** 操作描述（可选） */
  action?: string;
  /** 详细信息（可选） */
  detail?: string;
  /** 任务状态（可选） */
  status?: TaskStatus;
  /** 错误信息（task:failed 时必填） */
  error?: string;
  /** 变更前的状态（task:state_changed 时） */
  from_state?: string;
  /** 变更后的状态（task:state_changed 时） */
  to_state?: string;
}

/**
 * 任务开始消息
 */
export interface TaskStartedMessage extends WebSocketMessage {
  event: 'task:started';
  agent: AgentType;
  action: string;
  status: 'running';
}

/**
 * 任务进度消息
 */
export interface TaskProgressMessage extends WebSocketMessage {
  event: 'task:progress';
  agent?: AgentType;
  detail: string;
}

/**
 * 任务完成消息
 */
export interface TaskCompletedMessage extends WebSocketMessage {
  event: 'task:completed';
  agent?: AgentType;
  status: 'success';
  detail?: string;
}

/**
 * 任务失败消息
 */
export interface TaskFailedMessage extends WebSocketMessage {
  event: 'task:failed';
  status: 'error';
  error: string;
}

/**
 * 任务心跳消息
 */
export interface TaskHeartbeatMessage extends WebSocketMessage {
  event: 'task:heartbeat';
  agent?: AgentType;
  detail?: string;
}

/**
 * 任务状态变更消息
 */
export interface TaskStateChangedMessage extends WebSocketMessage {
  event: 'task:state_changed';
  from_state: string;
  to_state: string;
}

/**
 * 类型守卫：检查是否为 TaskFailedMessage
 */
export function isTaskFailedMessage(msg: WebSocketMessage): msg is TaskFailedMessage {
  return msg.event === 'task:failed';
}

/**
 * 类型守卫：检查是否为 TaskStartedMessage
 */
export function isTaskStartedMessage(msg: WebSocketMessage): msg is TaskStartedMessage {
  return msg.event === 'task:started';
}

/**
 * 类型守卫：检查是否为 TaskProgressMessage
 */
export function isTaskProgressMessage(msg: WebSocketMessage): msg is TaskProgressMessage {
  return msg.event === 'task:progress';
}

/**
 * 类型守卫：检查是否为 TaskCompletedMessage
 */
export function isTaskCompletedMessage(msg: WebSocketMessage): msg is TaskCompletedMessage {
  return msg.event === 'task:completed';
}

/**
 * 类型守卫：检查是否为 TaskHeartbeatMessage
 */
export function isTaskHeartbeatMessage(msg: WebSocketMessage): msg is TaskHeartbeatMessage {
  return msg.event === 'task:heartbeat';
}

/**
 * 类型守卫：检查是否为 TaskStateChangedMessage
 */
export function isTaskStateChangedMessage(msg: WebSocketMessage): msg is TaskStateChangedMessage {
  return msg.event === 'task:state_changed';
}

export default WebSocketMessage;
