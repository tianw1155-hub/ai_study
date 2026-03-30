'use client';

import { useState } from 'react';
import { GitHubRepoInfo } from '@/types/delivery';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface GitHubCardProps {
  repoInfo: GitHubRepoInfo;
}

export function GitHubCard({ repoInfo }: GitHubCardProps) {
  const [cloneMode, setCloneMode] = useState<'ssh' | 'https'>('ssh');
  const [copied, setCopied] = useState<string | null>(null);

  const shortCommit = repoInfo.latest_commit_sha.slice(0, 7);

  const cloneUrl =
    cloneMode === 'ssh'
      ? `git@github.com:${repoInfo.repo_url.replace('https://github.com/', '')}.git`
      : `https://github.com/${repoInfo.repo_url.replace('https://github.com/', '')}.git`;

  const handleCopy = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const openGitHub = () => {
    window.open(`https://${repoInfo.repo_url}`, '_blank');
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900">📦 代码仓库</span>
          <Button variant="primary" size="sm" onClick={openGitHub}>
            打开 GitHub
          </Button>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
              {repoInfo.repo_url}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(repoInfo.repo_url, 'url')}
            >
              {copied === 'url' ? '✓' : '📋'}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="info">{repoInfo.default_branch}</Badge>
          <span className="text-gray-400">│</span>
          <code className="text-sm text-gray-600">{shortCommit}</code>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">克隆命令：</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCloneMode('ssh')}
                className={`px-2 py-1 text-xs rounded ${
                  cloneMode === 'ssh' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                SSH
              </button>
              <button
                onClick={() => setCloneMode('https')}
                className={`px-2 py-1 text-xs rounded ${
                  cloneMode === 'https'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                HTTPS
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-gray-100 px-3 py-2 rounded overflow-x-auto">
              {cloneUrl}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleCopy(cloneUrl, 'clone')}
            >
              {copied === 'clone' ? '✓ 已复制' : '复制'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
