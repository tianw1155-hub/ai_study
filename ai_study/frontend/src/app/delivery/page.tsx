'use client';

import { useState, useEffect } from 'react';
import { PRDDisplay } from '@/components/delivery/PRDDisplay';
import { GitHubCard } from '@/components/delivery/GitHubCard';
import { FileTree } from '@/components/delivery/FileTree';
import { DeployConsole } from '@/components/delivery/DeployConsole';
import {
  fetchPRD,
  fetchGitHubInfo,
  fetchFileTree,
  rollbackPRD,
} from '@/lib/delivery-api';
import { PRDVersion, GitHubRepoInfo, FileTreeNode } from '@/types/delivery';

export default function DeliveryPage() {
  const [taskId] = useState('t12345');
  const [prd, setPrd] = useState<{ current: PRDVersion; versions: PRDVersion[] } | null>(
    null
  );
  const [repoInfo, setRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [prdData, githubData, filesData] = await Promise.all([
          fetchPRD(taskId).catch(() => ({
            current: {
              id: '1',
              version: 'v1.0',
              content: '# PRD 文档\n\n这是示例 PRD 内容。\n\n## 功能列表\n\n- 功能 1\n- 功能 2',
              commit_sha: 'abc1234',
              is_current: true,
              created_at: new Date().toISOString(),
            },
            versions: [],
          })),
          fetchGitHubInfo(taskId).catch(() => ({
            repo_url: 'github.com/devpilot/t12345',
            default_branch: '',
            latest_commit_sha: 'abc1234567890',
            clone_command: 'git@github.com:devpilot/t12345.git',
          })),
          fetchFileTree(taskId).catch(() => [
            {
              path: 'src',
              type: 'tree' as const,
              size: 0,
              sha: '1',
              children: [
                {
                  path: 'src/index.tsx',
                  type: 'blob' as const,
                  size: 1024,
                  sha: '2',
                },
                {
                  path: 'src/App.tsx',
                  type: 'blob' as const,
                  size: 2048,
                  sha: '3',
                },
              ],
            },
            {
              path: 'README.md',
              type: 'blob' as const,
              size: 512,
              sha: '4',
            },
          ]),
        ]);

        setPrd(prdData);
        setRepoInfo(githubData);
        setFileTree(filesData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [taskId]);

  const handlePRDRollback = async (versionId: string) => {
    try {
      await rollbackPRD(taskId, versionId);
      const prdData = await fetchPRD(taskId);
      setPrd(prdData);
    } catch (e) {
      console.error('Rollback failed:', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-48" />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-4">
                <div className="h-64 bg-gray-200 rounded" />
                <div className="h-48 bg-gray-200 rounded" />
              </div>
              <div className="lg:col-span-2">
                <div className="h-64 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md">
          <div className="text-red-600 text-center">
            <span className="text-2xl">⚠️</span>
            <p className="mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              ← 返回任务看板
            </a>
            <h1 className="text-2xl font-bold text-gray-900">产物交付中心</h1>
            <span className="text-gray-500">任务 #{taskId}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3 space-y-6">
            {prd && (
              <PRDDisplay
                taskId={taskId}
                current={prd.current}
                versions={prd.versions}
                onRollback={handlePRDRollback}
              />
            )}

            {repoInfo && (
              <div className="space-y-4">
                <GitHubCard repoInfo={repoInfo} />
                <FileTree
                  files={fileTree}
                  taskId={taskId}
                  defaultBranch={repoInfo.default_branch}
                />
              </div>
            )}
          </div>

          <div className="xl:col-span-2">
            <DeployConsole taskId={taskId} />
          </div>
        </div>
      </div>
    </div>
  );
}
