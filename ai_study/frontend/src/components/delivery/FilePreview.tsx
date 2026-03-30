'use client';

import { useState, useEffect, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/Button';
import { fetchFileContent } from '@/lib/delivery-api';

interface FilePreviewProps {
  taskId: string;
  path: string;
  ref_: string;
  onClose: () => void;
}

const MAX_LINES = 1000;
const MAX_SIZE_BYTES = 1024 * 1024;

export function FilePreview({ taskId, path, ref_, onClose }: FilePreviewProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLargeFile, setIsLargeFile] = useState(false);

  const filename = path.split('/').pop() || path;
  const language = filename.split('.').pop()?.toLowerCase() || 'text';

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const text = await fetchFileContent(taskId, path, ref_);
      const size = new Blob([text]).size;

      if (size > MAX_SIZE_BYTES) {
        setIsLargeFile(true);
        const lines = text.split('\n').slice(0, MAX_LINES);
        setContent(lines.join('\n'));
      } else {
        setContent(text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [taskId, path, ref_]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openInNewTab = () => {
    const rawUrl = `https://raw.githubusercontent.com/${taskId}/${ref_}/${path}`;
    window.open(rawUrl, '_blank');
  };

  const getLineCount = (text: string) => text.split('\n').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-8">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-gray-900">{filename}</span>
            <span className="text-sm text-gray-500">{path}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? '✓ 已复制' : '复制代码'}
            </Button>
            <Button variant="ghost" size="sm" onClick={openInNewTab}>
              新标签页打开
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {isLargeFile && (
          <div className="px-6 py-2 bg-yellow-50 border-b border-yellow-200">
            <span className="text-sm text-yellow-700">
              ⚠️ 文件过大，仅展示前 {MAX_LINES} 行
            </span>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-gray-900">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              加载中...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-400">
              {error}
            </div>
          ) : (
            <SyntaxHighlighter
              language={language}
              style={oneDark}
              showLineNumbers
              lineNumberStyle={{ color: '#6e7681', minWidth: '3em' }}
              customStyle={{
                margin: 0,
                padding: '16px',
                background: 'transparent',
              }}
            >
              {content}
            </SyntaxHighlighter>
          )}
        </div>

        <div className="px-6 py-2 border-t border-gray-200 text-xs text-gray-500">
          {getLineCount(content)} 行 | {path} @ {ref_}
        </div>
      </div>
    </div>
  );
}
