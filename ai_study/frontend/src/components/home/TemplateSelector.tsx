'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  icon: string;
  category: string;
}

async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch(`${API_BASE}/api/templates`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error('获取模板列表失败');
  return res.json();
}

// 常见场景模板（API 不可用时的 fallback）
const FALLBACK_TEMPLATES: Template[] = [
  {
    id: '1',
    name: 'REST API 开发',
    description: '快速创建一个标准的 RESTful API 服务',
    content: '创建一个用户管理 REST API，包含增删改查功能，使用 Node.js + Express',
    icon: '🌐',
    category: '后端',
  },
  {
    id: '2',
    name: 'React 组件库',
    description: '基于 Tailwind CSS 的组件库脚手架',
    content: '创建一个 React 组件库项目，使用 Tailwind CSS，包含 Button、Input、Card 基础组件',
    icon: '⚛️',
    category: '前端',
  },
  {
    id: '3',
    name: '数据分析脚本',
    description: 'Python 数据处理与可视化',
    content: '用 Python 写一个数据清洗脚本，读取 CSV 文件，进行数据清洗后输出可视化报告',
    icon: '📊',
    category: '数据',
  },
  {
    id: '4',
    name: 'CRUD 管理后台',
    description: 'Next.js 管理后台模板',
    content: '创建一个 Next.js 管理后台，包含用户管理、权限控制、数据统计仪表盘',
    icon: '🖥️',
    category: '全栈',
  },
  {
    id: '5',
    name: '微信小程序',
    description: '轻量级微信小程序开发',
    content: '开发一个微信小程序，实现笔记收藏功能，支持云开发',
    icon: '📱',
    category: '移动',
  },
];

interface TemplateSelectorProps {
  onSelect: (content: string) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelect }) => {
  const { data: templates = [], isLoading, isError } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
    initialData: FALLBACK_TEMPLATES,
    retry: 1,
  });

  // 使用 fallback 模板
  const displayTemplates = templates.length > 0 ? templates : FALLBACK_TEMPLATES;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '后端': 'bg-orange-100 text-orange-700',
      '前端': 'bg-blue-100 text-blue-700',
      '数据': 'bg-green-100 text-green-700',
      '全栈': 'bg-purple-100 text-purple-700',
      '移动': 'bg-pink-100 text-pink-700',
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="p-4 bg-gray-50 rounded-xl border border-gray-200 animate-pulse"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gray-200 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
            <div className="h-3 bg-gray-100 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">快速开始模板</h3>
        {isError && (
          <span className="text-xs text-gray-400">(使用本地模板)</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {displayTemplates.slice(0, 5).map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onSelect(tpl.content)}
            className="group text-left p-4 bg-white rounded-xl border border-gray-200
              hover:border-brand-blue hover:shadow-md transition-all duration-200"
          >
            {/* 头部 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center
                text-xl group-hover:scale-110 transition-transform">
                {tpl.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand-blue
                  transition-colors">
                  {tpl.name}
                </h4>
                <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded
                  ${getCategoryColor(tpl.category)}`}>
                  {tpl.category}
                </span>
              </div>
            </div>

            {/* 描述 */}
            <p className="text-xs text-gray-500 line-clamp-2">{tpl.description}</p>

            {/* 预览内容 */}
            <p className="mt-2 text-xs text-gray-400 truncate">
              {tpl.content.slice(0, 40)}{tpl.content.length > 40 ? '...' : ''}
            </p>
          </button>
        ))}
      </div>

      <style jsx>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};
