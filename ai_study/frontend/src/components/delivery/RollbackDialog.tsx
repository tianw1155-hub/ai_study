'use client';

import { useState } from 'react';
import { PRDVersion, RollbackLog } from '@/types/delivery';
import { Button } from '@/components/ui/Button';

interface RollbackDialogProps {
  version: PRDVersion;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RollbackDialog({ version, onConfirm, onCancel }: RollbackDialogProps) {
  const [rollbackSteps, setRollbackSteps] = useState<RollbackLog[]>([]);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<number | null>(null);

  const steps = [
    { name: 'Git revert', description: '回退代码到目标版本' },
    { name: '更新 PRD', description: '将 PRD 指向目标版本' },
    { name: '触发部署', description: '重新部署预览' },
  ];

  const handleRollback = async () => {
    setIsRollingBack(true);
    setRollbackSteps([]);
    setErrorMessage(null);
    setFailedStep(null);

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setRollbackSteps((prev) => [
        ...prev,
        {
          id: `step-${i}`,
          task_id: '',
          target_version: version.version,
          step: i + 1,
          step_name: steps[i].name,
          status: 'pending',
          retry_count: 0,
        },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate random failure for demo (remove in production)
      const shouldFail = i === 1 && Math.random() < 0.3;
      if (shouldFail) {
        setRollbackSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'failed' as const } : s
          )
        );
        setFailedStep(i);
        setErrorMessage(`步骤 "${steps[i].name}" 执行失败：Git revert 操作超时，请重试。`);
        setIsRollingBack(false);
        return;
      }

      setRollbackSteps((prev) =>
        prev.map((s, idx) =>
          idx === i ? { ...s, status: 'completed' as const } : s
        )
      );
    }

    setIsRollingBack(false);
    onConfirm();
  };

  const handleContinue = () => {
    setErrorMessage(null);
    setFailedStep(null);
    // Retry from failed step
    handleRollback();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">⚠️ 确认回退</h3>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-sm text-yellow-800">
              ⚠️ 回退后无法恢复当前版本，确定继续？
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">回退影响范围：</span>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• 📄 PRD：将回退到 {version.version}</li>
              <li>• 💻 代码：GitHub 将创建 revert commit</li>
              <li>• 🚀 预览：重新部署到目标版本</li>
            </ul>
          </div>

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          )}

          {isRollingBack && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-700">回退进度：</span>
              <div className="space-y-1">
                {steps.map((step, i) => {
                  const log = rollbackSteps.find((s) => s.step === i + 1);
                  const isFailed = log?.status === 'failed';
                  const isRunning = i === currentStep && !isFailed;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {log?.status === 'completed' ? (
                        <span className="text-green-600">✓</span>
                      ) : isFailed ? (
                        <span className="text-red-600">✗</span>
                      ) : isRunning ? (
                        <span className="animate-spin text-blue-600">⏳</span>
                      ) : (
                        <span className="text-gray-300">○</span>
                      )}
                      <span
                        className={
                          log?.status === 'completed'
                            ? 'text-green-600'
                            : isFailed
                            ? 'text-red-600'
                            : isRunning
                            ? 'text-blue-600'
                            : 'text-gray-400'
                        }
                      >
                        {step.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {isRollingBack ? (
            <Button variant="secondary" disabled>
              回退中...
            </Button>
          ) : errorMessage ? (
            <>
              <Button variant="ghost" onClick={onCancel}>
                取消
              </Button>
              <Button variant="primary" onClick={handleContinue}>
                继续
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onCancel}>
                取消
              </Button>
              <Button variant="danger" onClick={handleRollback}>
                确认回退
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
