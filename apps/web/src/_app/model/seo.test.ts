import { describe, expect, it } from 'vitest';
import { metadata, robots, sitemap, viewport } from '@/_app';
import { metadata as homeMetadata } from '@/_pages/home';

describe('robots', () => {
  it('разрешает всё и указывает sitemap', () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: '*', allow: '/' });
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe('sitemap', () => {
  it('содержит корень без двойного слэша', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/'))).toBe(true);
    expect(urls.every((u) => !u.slice(8).includes('//'))).toBe(true);
  });
});

describe('metadata', () => {
  it('title, description и viewport-fit', () => {
    expect((metadata.title as { default: string }).default).toBeTruthy();
    expect(metadata.description).toBeTruthy();
    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(viewport.viewportFit).toBe('cover');
  });

  it('главная: canonical и OG с локалью', () => {
    expect(homeMetadata.alternates?.canonical).toBe('/');
    expect((homeMetadata.openGraph as { locale?: string }).locale).toBe('ru_RU');
  });
});
