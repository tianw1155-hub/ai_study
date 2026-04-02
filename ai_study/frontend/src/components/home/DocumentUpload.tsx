'use client';

import React, { useState, useRef, useCallback, DragEvent } from 'react';

const API_BASE = 'http://localhost:8085';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const ACCEPTED_TYPES = ['.md', '.docx', '.pdf', '.txt'];

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error' | 'parsing';
  progress: number;
  parseResult?: {
    summary: string;
    blocks: number;
    words: number;
  };
  error?: string;
}

interface DocumentUploadProps {
  onFilesUploaded?: (files: UploadedFile[]) => void;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onFilesUploaded }) => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = (fileList: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    if (files.length + fileList.length > MAX_FILES) {
      errors.push(`最多只能上传 ${MAX_FILES} 个文件`);
      return { valid, errors };
    }

    for (const file of fileList) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_TYPES.includes(ext)) {
        errors.push(`${file.name}：不支持的格式，仅支持 ${ACCEPTED_TYPES.join('/')}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}：文件超过 10MB 限制`);
        continue;
      }
      valid.push(file);
    }

    return { valid, errors };
  };

  const uploadFile = async (file: File): Promise<UploadedFile> => {
    const id = Math.random().toString(36).slice(2);
    const uploadedFile: UploadedFile = {
      id,
      name: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0,
    };

    setFiles((prev) => [...prev, uploadedFile]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 模拟上传进度（实际应该用 XMLHttpRequest）
      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id && f.status === 'uploading'
              ? { ...f, progress: Math.min(f.progress + 15, 90) }
              : f
          )
        );
      }, 200);

      const res = await fetch(`${API_BASE}/api/documents/upload`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000),
      });

      clearInterval(progressInterval);

      if (!res.ok) throw new Error('上传失败');

      const data = await res.json();
      const fileId = data.id || id;

      // 调用解析接口
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: 'parsing', progress: 95 } : f))
      );

      try {
        const parseRes = await fetch(`${API_BASE}/api/documents/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: fileId }),
          signal: AbortSignal.timeout(30000),
        });

        if (parseRes.ok) {
          const parseData = await parseRes.json();
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? {
                    ...f,
                    status: 'done',
                    progress: 100,
                    parseResult: {
                      summary: parseData.summary || '解析完成',
                      blocks: parseData.blocks || 0,
                      words: parseData.words || 0,
                    },
                  }
                : f
            )
          );
        } else {
          throw new Error('解析失败');
        }
      } catch (parseErr) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: 'done', progress: 100 } : f
          )
        );
      }

      const finalFile = files.find((f) => f.id === id);
      if (finalFile && onFilesUploaded) {
        onFilesUploaded([...files, { ...finalFile, status: 'done', progress: 100 }]);
      }

      return { ...uploadedFile, status: 'done', progress: 100 };
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: 'error', error: err instanceof Error ? err.message : '上传失败' }
            : f
        )
      );
      return { ...uploadedFile, status: 'error', error: err instanceof Error ? err.message : '上传失败' };
    }
  };

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const { valid, errors } = validateFiles(Array.from(fileList));
    if (errors.length > 0) {
      setError(errors.join('；'));
      return;
    }
    await Promise.all(Array.from(valid).map(uploadFile));
  }, [files]);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="w-full">
      {/* 上传区域 */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center w-full h-40 rounded-lg border-2 border-dashed cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-brand-blue bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
          }
          ${files.length >= MAX_FILES ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-gray-600">
          拖拽文件到此处，或 <span className="text-brand-blue font-medium">点击上传</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          支持 .md/.docx/.pdf/.txt，单文件最大 10MB，最多 {MAX_FILES} 个文件
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-500">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              {/* 文件图标 */}
              <div className="flex-shrink-0 w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                <span className="text-xs text-gray-500 font-medium">
                  {file.name.split('.').pop()?.toUpperCase()}
                </span>
              </div>

              {/* 文件信息 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{formatSize(file.size)}</span>
                  {file.status === 'uploading' && (
                    <span className="text-xs text-brand-blue">{file.progress}%</span>
                  )}
                  {file.status === 'parsing' && (
                    <span className="text-xs text-yellow-600">解析中...</span>
                  )}
                  {file.status === 'done' && file.parseResult && (
                    <span className="text-xs text-green-600">
                      已解析 {file.parseResult.blocks} 块 / {file.parseResult.words} 字
                    </span>
                  )}
                  {file.status === 'error' && (
                    <span className="text-xs text-red-500">{file.error}</span>
                  )}
                </div>

                {/* 进度条 */}
                {(file.status === 'uploading' || file.status === 'parsing') && (
                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-blue rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex-shrink-0 flex items-center gap-1">
                {file.status === 'done' && file.parseResult && (
                  <button
                    onClick={() => setPreviewFile(file)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    title="预览摘要"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleRemove(file.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                  title="移除"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 预览弹窗 */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">文档预览</h3>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">{previewFile.name}</p>
            <div className="text-xs text-gray-500 mb-3">
              {previewFile.parseResult?.blocks} 块 / {previewFile.parseResult?.words} 字
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {previewFile.parseResult?.summary || '暂无摘要'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
