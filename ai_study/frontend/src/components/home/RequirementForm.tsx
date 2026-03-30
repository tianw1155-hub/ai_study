'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RequirementInput } from './RequirementInput';
import { DocumentUpload } from './DocumentUpload';

const API_BASE = 'http://localhost:8080';

interface RequirementFormProps {
  initialValue?: string;
  templates?: string[];
}

export const RequirementForm: React.FC<RequirementFormProps> = ({
  initialValue = '',
  templates = [],
}) => {
  const router = useRouter();
  const [requirement, setRequirement] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [toast, setToast] = useState<{ taskId: string } | null>(null);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorModal(null);

    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/requirements/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: requirement }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `请求失败 (${res.status})`);
      }

      const data = await res.json();
      const taskId = data.task_id || data.requirement_id || '未知任务';

      // 成功 toast
      setToast({ taskId });
      setTimeout(() => {
        router.push('/kanban');
      }, 1500);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setErrorModal('请求超时，请检查网络后重试');
      } else {
        setErrorModal(err instanceof Error ? err.message : '网络错误，请稍后重试');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTemplateSelect = (template: string) => {
    setRequirement(template);
  };

  return (
    <div className="w-full space-y-4">
      {/* 模板选择 */}
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templates.map((t, i) => (
            <button
              key={i}
              onClick={() => handleTemplateSelect(t)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-full
                hover:bg-gray-200 hover:text-gray-800 transition-colors"
            >
              {t.slice(0, 20)}{t.length > 20 ? '...' : ''}
            </button>
          ))}
        </div>
      )}

      {/* 文档上传 */}
      <DocumentUpload />

      {/* 需求输入 */}
      <RequirementInput
        value={requirement}
        onChange={setRequirement}
        onSubmit={handleSubmit}
        disabled={isSubmitting}
      />

      {/* 提交按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || requirement.trim().length < 10}
          className={`
            flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white
            transition-all duration-200
            ${isSubmitting || requirement.trim().length < 10
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-brand-blue hover:bg-blue-600 active:scale-95'
            }
          `}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              正在提交...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              提交需求
            </>
          )}
        </button>
      </div>

      {/* 错误弹窗 */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900">提交失败</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">{errorModal}</p>
            <button
              onClick={() => setErrorModal(null)}
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 成功 Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
          px-4 py-3 bg-green-600 text-white rounded-lg shadow-lg animate-fade-in-up">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="text-sm font-medium">提交成功！</p>
            <p className="text-xs text-green-200">任务 ID: {toast.taskId}</p>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translate(-50%, 10px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};
