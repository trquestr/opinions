import path from 'node:path';
import type { NextConfig } from 'next';
import { parseServerEnv } from './src/shared/config/env-schema';
import { buildSecurityHeaders } from './src/shared/config/security-headers';

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Минимальный самодостаточный сервер для Docker (.next/standalone).
  output: 'standalone',
  // В монорепо зависимости (workspace-пакеты, hoisted node_modules) лежат выше apps/web — трассировку считаем от корня.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  async headers() {
    return [{ source: '/(.*)', headers: buildSecurityHeaders(isDev) }];
  },
  // Только в dev: /api на тот же origin проксируется на apps/api. В проде /api маршрутизирует reverse proxy.
  async rewrites() {
    if (!isDev) return [];
    const { API_INTERNAL_URL } = parseServerEnv(process.env);
    return [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
};

export default nextConfig;
