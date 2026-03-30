'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
  const [stats, setStats] = useState({ users: 0, tasks: 0 });

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/stats`)
      .then(r => r.json())
      .then(d => setStats({ users: d.users || 0, tasks: d.tasks || 0 }))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
          用自然语言，创造任何应用
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          描述你的需求，AI 开发团队自动规划、编码、测试、部署，全流程托管
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Link href="/kanban" className="p-6 bg-white rounded-lg shadow-md border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all">
          <div className="text-3xl mb-3">📋</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">任务看板</h2>
          <p className="text-gray-600">查看和管理所有开发任务，实时跟踪进度</p>
        </Link>

        <Link href="/delivery" className="p-6 bg-white rounded-lg shadow-md border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all">
          <div className="text-3xl mb-3">📦</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">产物交付</h2>
          <p className="text-gray-600">查看已完成的项目产物和交付物</p>
        </Link>

        <Link href="/login" className="p-6 bg-white rounded-lg shadow-md border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all">
          <div className="text-3xl mb-3">🔐</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">登录</h2>
          <p className="text-gray-600">登录以访问更多功能和个人设置</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: '🤖', title: 'AI 智能规划', desc: '自动拆解任务，生成最优开发路径' },
          { icon: '⚡', title: '实时进度', desc: 'WebSocket 推送，毫秒级状态更新' },
          { icon: '🔒', title: '代码审查', desc: '自动 Review，确保代码质量' },
          { icon: '🚀', title: '一键部署', desc: '自动构建发布，无需人工干预' },
        ].map((feature, idx) => (
          <div key={idx} className="p-4 bg-white rounded-xl border border-gray-200">
            <div className="text-2xl mb-2">{feature.icon}</div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{feature.title}</h3>
            <p className="text-xs text-gray-500">{feature.desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center py-6 border-t border-gray-200 mt-8">
        <p className="text-sm text-gray-500">
          已为 <span className="font-semibold text-gray-900">{stats.users}</span> 位开发者完成{' '}
          <span className="font-semibold text-gray-900">{stats.tasks}</span> 个任务
        </p>
      </div>
    </div>
  );
}
