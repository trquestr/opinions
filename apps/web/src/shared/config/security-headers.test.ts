import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders } from './security-headers';

const get = (isDev: boolean, key: string) => buildSecurityHeaders(isDev).find((h) => h.key === key)?.value;

describe('buildSecurityHeaders', () => {
  it('prod: HSTS и upgrade-insecure-requests, без unsafe-eval', () => {
    expect(get(false, 'Strict-Transport-Security')).toContain('max-age=63072000');
    const csp = get(false, 'Content-Security-Policy') ?? '';
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain('ws:');
  });

  it('dev: unsafe-eval и ws:, без HSTS и upgrade-insecure-requests', () => {
    expect(get(true, 'Strict-Transport-Security')).toBeUndefined();
    const csp = get(true, 'Content-Security-Policy') ?? '';
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it.each([true, false])('isDev=%s: frame-ancestors и базовые заголовки', (isDev) => {
    expect(get(isDev, 'Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(get(isDev, 'X-Content-Type-Options')).toBe('nosniff');
    expect(get(isDev, 'X-Frame-Options')).toBe('DENY');
    expect(get(isDev, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(get(isDev, 'Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(get(isDev, 'Permissions-Policy')).toContain('camera=()');
  });
});
