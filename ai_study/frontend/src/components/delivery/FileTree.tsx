'use client';

import { useState } from 'react';
import { FileTreeNode } from '@/types/delivery';
import { FilePreview } from './FilePreview';

interface FileTreeProps {
  files: FileTreeNode[];
  taskId: string;
  defaultBranch: string;
}

const fileIcons: Record<string, string> = {
  ts: '🔧',
  tsx: '⚛️',
  js: '📜',
  jsx: '⚛️',
  go: '🐹',
  py: '🐍',
  rs: '🦀',
  md: '📝',
  json: '📋',
  yaml: '⚙️',
  yml: '⚙️',
  css: '🎨',
  scss: '🎨',
  html: '🌐',
  default: '📄',
};

const getFileIcon = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return fileIcons[ext] || fileIcons.default;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface FileTreeNodeItemProps {
  node: FileTreeNode;
  level: number;
  taskId: string;
  defaultBranch: string;
}

function FileTreeNodeItem({ node, level, taskId, defaultBranch }: FileTreeNodeItemProps) {
  const [expanded, setExpanded] = useState(level === 0);
  const [showPreview, setShowPreview] = useState(false);

  const filename = node.path.split('/').pop() || node.path;
  const isTree = node.type === 'tree';

  return (
    <>
      <div
        className="flex items-center gap-2 py-1 px-2 hover:bg-gray-800 cursor-pointer rounded"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => (isTree ? setExpanded(!expanded) : setShowPreview(true))}
      >
        <span className="text-gray-500">{expanded ? '📂' : isTree ? '📁' : getFileIcon(filename)}</span>
        <span className="text-sm text-gray-300 flex-1">{filename}</span>
        {!isTree && (
          <>
            <span className="text-xs text-gray-400">{formatFileSize(node.size)}</span>
            {node.last_modified && (
              <span className="text-xs text-gray-400">
                {new Date(node.last_modified).toLocaleDateString('zh-CN')}
              </span>
            )}
          </>
        )}
      </div>

      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNodeItem
              key={child.sha}
              node={child}
              level={level + 1}
              taskId={taskId}
              defaultBranch={defaultBranch}
            />
          ))}
        </div>
      )}

      {showPreview && !isTree && (
        <FilePreview
          taskId={taskId}
          path={node.path}
          ref_={defaultBranch}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

export function FileTree({ files, taskId, defaultBranch }: FileTreeProps) {
  return (
    <div className="bg-gray-900 rounded-lg shadow-md border border-gray-700 mt-4">
      <div className="px-6 py-4 border-b border-gray-700">
        <span className="text-lg font-semibold text-white">📂 文件结构</span>
      </div>
      <div className="px-6 py-4 max-h-[400px] overflow-y-auto">
        {files.map((node) => (
          <FileTreeNodeItem
            key={node.sha}
            node={node}
            level={0}
            taskId={taskId}
            defaultBranch={defaultBranch}
          />
        ))}
      </div>
    </div>
  );
}
