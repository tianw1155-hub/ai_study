import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API 代理：开发环境将 /api/* 请求转发到后端
  // 这样前端即使没有配置 NEXT_PUBLIC_API_URL 也能正常调通
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*',
      },
      {
        source: '/ws',
        destination: 'http://localhost:8080/ws',
      },
    ];
  },
};

export default nextConfig;
