'use client';

import { useState } from 'react';
import { PRDVersion } from '@/types/delivery';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RollbackDialog } from './RollbackDialog';

interface PRDVersionHistoryProps {
  versions: PRDVersion[];
  currentVersionId: string;
  onRollback?: (versionId: string) => void;
}

export function PRDVersionHistory({
  versions,
  currentVersionId,
  onRollback,
}: PRDVersionHistoryProps) {
  const [rollbackTarget, setRollbackTarget] = useState<PRDVersion | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getChangeSummary = (content: string): string => {
    const lines = content.split('\n').filter((l) => l.trim());
    const summary = lines.slice(0, 3).join(' ').slice(0, 50);
    return summary + (lines.join(' ').length > 50 ? '...' : '');
  };

  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <>
      <div className="space-y-4">
        {sortedVersions.map((version, index) => (
          <div key={version.id} className="relative pl-8">
            {index !== sortedVersions.length - 1 && (
              <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-700" />
            )}
            <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 ml-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant={version.is_current ? 'success' : 'default'}>
                    {version.version}
                  </Badge>
                  {version.id === currentVersionId && (
                    <span className="text-xs text-green-400 font-medium">当前版本</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{formatDate(version.created_at)}</span>
              </div>

              <p className="text-sm text-gray-400 mb-3">{getChangeSummary(version.content)}</p>

              {!version.is_current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white"
                  onClick={() => setRollbackTarget(version)}
                >
                  回退到此版本
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {rollbackTarget && (
        <RollbackDialog
          version={rollbackTarget}
          onConfirm={() => {
            onRollback?.(rollbackTarget.id);
            setRollbackTarget(null);
          }}
          onCancel={() => setRollbackTarget(null)}
        />
      )}
    </>
  );
}
