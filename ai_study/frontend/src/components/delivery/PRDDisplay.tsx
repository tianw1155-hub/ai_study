'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PRDVersion } from '@/types/delivery';
import { PRDVersionHistory } from './PRDVersionHistory';
import { PRDCompare } from './PRDCompare';

interface PRDDisplayProps {
  taskId: string;
  current: PRDVersion;
  versions: PRDVersion[];
  onRollback?: (versionId: string) => void;
}

export function PRDDisplay({
  taskId,
  current,
  versions,
  onRollback,
}: PRDDisplayProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  const downloadMarkdown = () => {
    const blob = new Blob([current.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PRD-${current.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(`PRD ${current.version}`, margin, y);
      y += 10;

      // Divider line
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      // Content - strip markdown syntax for plain text PDF
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const lines = current.content.split('\n');
      for (const line of lines) {
        // Skip HTML/image tags
        if (line.trim().startsWith('![') || line.trim().startsWith('<img')) continue;

        // Handle headers
        if (line.startsWith('# ')) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          y += 6;
          if (y > pageHeight - margin) { doc.addPage(); y = margin; }
          const text = line.replace(/^# /, '');
          const wrapped = doc.splitTextToSize(text, contentWidth);
          doc.text(wrapped, margin, y);
          y += wrapped.length * 7 + 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
        } else if (line.startsWith('## ')) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          y += 5;
          if (y > pageHeight - margin) { doc.addPage(); y = margin; }
          const text = line.replace(/^## /, '');
          const wrapped = doc.splitTextToSize(text, contentWidth);
          doc.text(wrapped, margin, y);
          y += wrapped.length * 6 + 3;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          const text = line.replace(/^[-*] /, '• ');
          const wrapped = doc.splitTextToSize(text, contentWidth);
          if (y + wrapped.length * 5 > pageHeight - margin) { doc.addPage(); y = margin; }
          doc.text(wrapped, margin, y);
          y += wrapped.length * 5;
        } else if (line.trim() === '') {
          y += 3;
        } else {
          // Regular paragraph
          const wrapped = doc.splitTextToSize(line, contentWidth);
          if (y + wrapped.length * 5 > pageHeight - margin) { doc.addPage(); y = margin; }
          doc.text(wrapped, margin, y);
          y += wrapped.length * 5;
        }
      }

      doc.save(`PRD-${current.version}.pdf`);
    } catch {
      alert('PDF导出功能开发中，敬请期待');
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-md border border-gray-700">
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-semibold text-white">📄 PRD 文档</span>
            <Badge variant="info">{current.version}（当前）</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCompare(!showCompare)}
              className="text-gray-300 hover:text-white hover:bg-gray-800"
            >
              版本对比
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
            >
              {showHistory ? '收起历史' : '版本历史'}
            </Button>
          </div>
        </div>
      </div>

      {showCompare && (
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-950">
          <PRDCompare versions={versions} />
        </div>
      )}

      {showHistory && (
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-950">
          <PRDVersionHistory
            versions={versions}
            currentVersionId={current.id}
            onRollback={onRollback}
          />
        </div>
      )}

      <div className="px-6 py-4 max-h-[600px] overflow-y-auto">
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {current.content}
          </ReactMarkdown>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-700 bg-gray-950 rounded-b-lg">
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={downloadMarkdown}>
            下载 MD
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadPDF} className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700">
            下载 PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
