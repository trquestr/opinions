import type { Metadata, Viewport } from 'next';
import { publicEnv, siteConfig } from '@/shared/config';

// Общие метаданные сайта. canonical и openGraph.url задаёт каждая страница сама:
// иначе у всех страниц canonical указывал бы на главную.
export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: siteConfig.name,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
