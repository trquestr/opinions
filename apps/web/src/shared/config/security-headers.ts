export interface SecurityHeader {
  key: string;
  value: string;
}

/*
 * Content-Security-Policy.
 * 'unsafe-inline' в script-src/style-src оставлен осознанно: страницы пререндерятся статически
 * (cacheComponents, SEO и скорость), а CSP с nonce требует динамического рендера на каждый запрос.
 * Решение принято ради SEO и скорости; остальные директивы (default-src, object-src, frame-ancestors…)
 * остаются строгими.
 */
function buildCsp(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

export function buildSecurityHeaders(isDev: boolean): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Content-Security-Policy', value: buildCsp(isDev) },
  ];
  if (!isDev) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains',
    });
  }
  return headers;
}
