import type { Metadata } from 'next';
import { siteConfig } from '@/shared/config';

// openGraph страницы заменяет openGraph корня целиком, поэтому общие поля повторяем.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    url: '/',
  },
};
