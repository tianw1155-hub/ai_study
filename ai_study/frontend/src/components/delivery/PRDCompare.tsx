'use client';

import { useState, useMemo } from 'react';
import * as Diff from 'diff';
import { PRDVersion } from '@/types/delivery';
import { Button } from '@/components/ui/Button';

interface PRDCompareProps {
  versions: PRDVersion[];
}

export function PRDCompare({ versions }: PRDCompareProps) {
  const [leftVersionId, setLeftVersionId] = useState<string>('');
  const [rightVersionId, setRightVersionId] = useState<string>('');
  const [showDiff, setShowDiff] = useState(false);

  const leftVersion = versions.find((v) => v.id === leftVersionId);
  const rightVersion = versions.find((v) => v.id === rightVersionId);

  const canCompare = leftVersionId && rightVersionId && leftVersionId !== rightVersionId;

  // Compute side-by-side diff rows
  const { leftLines, rightLines } = useMemo(() => {
    if (!leftVersion || !rightVersion || !showDiff) return { leftLines: [], rightLines: [] };

    const diff = Diff.diffLines(leftVersion.content, rightVersion.content);
    const left: Array<{ text: string; type: 'removed' | 'unchanged' | 'spacer' }> = [];
    const right: Array<{ text: string; type: 'added' | 'unchanged' | 'spacer' }> = [];

    for (const part of diff) {
      const lines = part.value.split('\n');
      // Remove trailing empty string from split
      if (lines[lines.length - 1] === '') lines.pop();

      for (const line of lines) {
        if (part.removed) {
          left.push({ text: line, type: 'removed' });
          right.push({ text: '', type: 'spacer' });
        } else if (part.added) {
          left.push({ text: '', type: 'spacer' });
          right.push({ text: line, type: 'added' });
        } else {
          left.push({ text: line, type: 'unchanged' });
          right.push({ text: line, type: 'unchanged' });
        }
      }
    }

    return { leftLines: left, rightLines: right };
  }, [leftVersion, rightVersion, showDiff]);

  const handleCompare = () => {
    if (canCompare) {
      setShowDiff(true);
    }
  };

  const resetCompare = () => {
    setShowDiff(false);
    setLeftVersionId('');
    setRightVersionId('');
  };

  const maxLines = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            选择版本 A（较旧）
          </label>
          <select
            value={leftVersionId}
            onChange={(e) => {
              setLeftVersionId(e.target.value);
              setShowDiff(false);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">选择版本...</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id} disabled={v.id === rightVersionId}>
                {v.version} - {new Date(v.created_at).toLocaleDateString('zh-CN')}
              </option>
            ))}
          </select>
        </div>

        <div className="text-gray-400 mt-6">↔</div>

        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            选择版本 B（较新）
          </label>
          <select
            value={rightVersionId}
            onChange={(e) => {
              setRightVersionId(e.target.value);
              setShowDiff(false);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">选择版本...</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id} disabled={v.id === leftVersionId}>
                {v.version} - {new Date(v.created_at).toLocaleDateString('zh-CN')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <Button
            variant="primary"
            size="sm"
            onClick={handleCompare}
            disabled={!canCompare}
          >
            对比
          </Button>
          {showDiff && (
            <Button variant="ghost" size="sm" onClick={resetCompare}>
              重置
            </Button>
          )}
        </div>
      </div>

      {showDiff && leftLines.length > 0 && (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-2 divide-x divide-gray-200 bg-gray-50 border-b border-gray-200">
            <div className="px-4 py-2">
              <span className="text-sm font-medium text-red-700">
                ← {leftVersion?.version}（删除）
              </span>
            </div>
            <div className="px-4 py-2">
              <span className="text-sm font-medium text-green-700">
                → {rightVersion?.version}（新增）
              </span>
            </div>
          </div>

          {/* Side-by-side diff body */}
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full border-collapse">
              <tbody>
                {Array.from({ length: maxLines }).map((_, idx) => {
                  const left = leftLines[idx];
                  const right = rightLines[idx];
                  return (
                    <tr key={idx} className="border-b border-gray-100">
                      {/* Left: removed or unchanged */}
                      <td
                        className={`px-3 py-0.5 font-mono text-sm whitespace-pre-wrap break-all ${
                          left?.type === 'removed'
                            ? 'bg-red-100 text-red-800'
                            : left?.type === 'spacer'
                            ? 'bg-gray-50'
                            : 'bg-white text-gray-800'
                        }`}
                        style={{ minWidth: 0, width: '50%' }}
                      >
                        {left?.type === 'removed' && (
                          <span className="text-red-500 mr-1">-</span>
                        )}
                        {left?.text ?? ''}
                      </td>
                      {/* Right: added or unchanged */}
                      <td
                        className={`px-3 py-0.5 font-mono text-sm whitespace-pre-wrap break-all ${
                          right?.type === 'added'
                            ? 'bg-green-100 text-green-800'
                            : right?.type === 'spacer'
                            ? 'bg-gray-50'
                            : 'bg-white text-gray-800'
                        }`}
                        style={{ minWidth: 0, width: '50%' }}
                      >
                        {right?.type === 'added' && (
                          <span className="text-green-500 mr-1">+</span>
                        )}
                        {right?.text ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
