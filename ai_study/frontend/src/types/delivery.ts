export interface PRDVersion {
  id: string;
  version: string;
  content: string;
  commit_sha: string;
  is_current: boolean;
  created_at: string;
}

export interface GitHubRepoInfo {
  repo_url: string;
  default_branch: string;
  latest_commit_sha: string;
  clone_command: string;
}

export interface FileTreeNode {
  path: string;
  type: 'tree' | 'blob';
  size: number;
  sha: string;
  last_modified?: string;
  children?: FileTreeNode[];
}

export interface Deployment {
  id: string;
  status: 'idle' | 'deploying' | 'success' | 'failed';
  commit_sha: string;
  preview_url: string;
  created_at: string;
}

export interface RollbackLog {
  id: string;
  task_id: string;
  target_version: string;
  step: number;
  step_name: string;
  status: 'pending' | 'completed' | 'failed';
  error_message?: string;
  retry_count: number;
  github_revert_sha?: string;
  deployment_id?: string;
}

export interface DeploymentLog {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'error';
}
