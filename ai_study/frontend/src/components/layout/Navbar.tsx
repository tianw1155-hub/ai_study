'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/home/NotificationBell";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/kanban", label: "任务看板" },
  { href: "/delivery", label: "产物交付" },
];

export function Navbar() {
  const pathname = usePathname();

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
            <NotificationBell />
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              登录
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
