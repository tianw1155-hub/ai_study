import {
  PRDVersion,
  GitHubRepoInfo,
  FileTreeNode,
  Deployment,
  RollbackLog,
} from '@/types/delivery';

const API_BASE = '/api/delivery';

export async function fetchPRD(
  taskId: string
): Promise<{ current: PRDVersion; versions: PRDVersion[] }> {
  const res = await fetch(`${API_BASE}/${taskId}/prd`);
  if (!res.ok) throw new Error('Failed to fetch PRD');
  return res.json();
}

export async function rollbackPRD(
  taskId: string,
  targetVersionId: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/${taskId}/prd/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetVersionId }),
  });
  if (!res.ok) throw new Error('Failed to rollback PRD');
}

export async function fetchGitHubInfo(taskId: string): Promise<GitHubRepoInfo> {
  const res = await fetch(`${API_BASE}/${taskId}/github`);
  if (!res.ok) throw new Error('Failed to fetch GitHub info');
  return res.json();
}

export async function fetchFileTree(taskId: string): Promise<FileTreeNode[]> {
  const res = await fetch(`${API_BASE}/${taskId}/github/tree`);
  if (!res.ok) throw new Error('Failed to fetch file tree');
  return res.json();
}

export async function fetchFileContent(
  taskId: string,
  path: string,
  ref: string
): Promise<string> {
  const res = await fetch(
    `${API_BASE}/${taskId}/github/file?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`
  );
  if (!res.ok) throw new Error('Failed to fetch file content');
  return res.text();
}

export async function triggerDeploy(
  taskId: string,
  platform: 'vercel' | 'render',
  type: 'frontend' | 'backend'
): Promise<Deployment> {
  const res = await fetch(`${API_BASE}/${taskId}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, type }),
  });
  if (!res.ok) throw new Error('Failed to trigger deploy');
  return res.json();
}

export async function fetchDeployStatus(
  taskId: string,
  deploymentId: string
): Promise<Deployment> {
  const res = await fetch(`${API_BASE}/${taskId}/deploy/${deploymentId}`);
  if (!res.ok) throw new Error('Failed to fetch deploy status');
  return res.json();
}

export async function fetchDeployments(taskId: string): Promise<Deployment[]> {
  const res = await fetch(`${API_BASE}/${taskId}/deployments`);
  if (!res.ok) throw new Error('Failed to fetch deployments');
  return res.json();
}

export async function fetchRollbackLogs(taskId: string): Promise<RollbackLog[]> {
  const res = await fetch(`${API_BASE}/${taskId}/rollback-logs`);
  if (!res.ok) throw new Error('Failed to fetch rollback logs');
  return res.json();
}

export async function triggerRollback(
  taskId: string,
  targetVersion: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/${taskId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetVersion }),
  });
  if (!res.ok) throw new Error('Failed to trigger rollback');
}
