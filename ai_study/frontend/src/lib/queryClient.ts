import { QueryClient } from "@tanstack/react-query";

/**
 * React Query Client Configuration
 * 
 * 用于全局配置 React Query 的默认选项。
 * 在 QueryProvider 中使用。
 * 
 * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryclient
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 数据被认为过期的时间（毫秒）
      // 默认：5 分钟（5 * 60 * 1000）
      staleTime: 5 * 60 * 1000,
      
      // 缓存数据保留在内存中的时间（毫秒）
      // 默认：5 分钟（formerly cacheTime）
      gcTime: 5 * 60 * 1000,
      
      // 失败重试次数
      // 默认：3 次
      retry: 3,
      
      // 是否在窗口获得焦点时自动重新获取
      // 默认：true
      refetchOnWindowFocus: false,
      
      // 是否在网络重新连接时自动重新获取
      // 默认：false
      refetchOnReconnect: false,
      
      // 是否在组件挂载时自动重新获取
      // 默认：false
      refetchOnMount: false,
    },
    mutations: {
      // 失败重试次数
      retry: 0,
    },
  },
});

export default queryClient;
