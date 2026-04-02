'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/home/NotificationBell";
import { getModelConfig } from "@/lib/store";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/kanban", label: "任务看板" },
  { href: "/delivery", label: "产物交付" },
];

export function Navbar() {
  const pathname = usePathname();
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [user, setUser] = useState<{ login: string; avatar_url?: string } | null>(null);

  useEffect(() => {
    const config = getModelConfig();
    if (config) {
      setModelLabel(config.model);
    }
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        // ignore
      }
    }
  }, []);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-brand-blue">DevPilot</span>
              <span className="text-xs text-gray-500">AI 开发团队平台</span>
            </Link>
            <nav className="flex space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${
                      pathname === item.href
                        ? "bg-brand-blue text-white"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }
                  `}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            {modelLabel && (
              <Link
                href="/setup"
                title="点击重新配置模型"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors"
              >
                <span>🤖</span>
                <span>{modelLabel}</span>
              </Link>
            )}
            {!modelLabel && (
              <Link
                href="/setup"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full text-xs font-medium hover:bg-orange-100 transition-colors"
              >
                <span>⚠️</span>
                <span>未配置模型</span>
              </Link>
            )}
            <NotificationBell />
            {user ? (
              <div className="flex items-center gap-2">
                {user.avatar_url && (
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-8 h-8 rounded-full border border-gray-200"
                  />
                )}
                <span className="text-sm font-medium text-gray-700">{user.login}</span>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-sm px-3 py-1.5 rounded-md font-medium text-white bg-brand-blue hover:bg-blue-600 transition-colors"
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
