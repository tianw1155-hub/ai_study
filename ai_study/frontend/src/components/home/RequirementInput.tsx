'use client';

import React, { useState, useRef, KeyboardEvent } from 'react';

const API_BASE = 'http://localhost:8080';
const MIN_CHARS = 10;
const MAX_CHARS = 2000;

interface SensitiveCheckResult {
  hasSensitive: boolean;
  words?: string[];
}

interface RequirementInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export const RequirementInput: React.FC<RequirementInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = value.length;
  const isUnderMin = charCount < MIN_CHARS;
  const isOverMax = charCount > MAX_CHARS;

  const handleSensitiveCheck = async (): Promise<SensitiveCheckResult> => {
    try {
      const res = await fetch(`${API_BASE}/api/sensitive/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error('敏感词检测服务异常');
      return await res.json();
    } catch (e) {
      // 网络错误时放行，不阻塞提交
      console.warn('敏感词检测失败:', e);
      return { hasSensitive: false };
    }
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 换行，Ctrl+Enter / Cmd+Enter 提交
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && !checking) {
        setChecking(true);
        setError(null);
        const check = await handleSensitiveCheck();
        setChecking(false);
        if (check.hasSensitive) {
          setError(`包含敏感词: ${check.words?.join('、') || '请修改后重试'}`);
          return;
        }
        onSubmit();
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (text.length <= MAX_CHARS) {
      onChange(text);
      if (error) setError(null);
    }
  };

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled || checking}
        placeholder="用自然语言描述你的需求..."
        rows={5}
        className={`
          w-full resize-none rounded-lg border px-4 py-3 pr-20
          text-gray-900 placeholder-gray-400
          focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent
          transition-shadow
          ${isOverMax ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}
          ${disabled || checking ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white'}
        `}
      />
      {/* 字符统计 */}
      <div className="absolute bottom-2 right-3 flex items-center gap-1">
        <span
          className={`text-xs ${
            isOverMax
              ? 'text-red-500 font-medium'
              : isUnderMin
              ? 'text-gray-400'
              : 'text-gray-500'
          }`}
        >
          {charCount}
        </span>
        <span className="text-xs text-gray-400">/ {MAX_CHARS}</span>
      </div>
      {/* 错误提示 */}
      {error && (
        <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </p>
      )}
      {/* 提交提示 */}
      <p className="mt-1 text-xs text-gray-400">
        按 <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">Ctrl</kbd> + <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">Enter</kbd> 提交
      </p>
    </div>
  );
};
