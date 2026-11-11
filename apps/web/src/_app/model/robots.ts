import type { MetadataRoute } from 'next';
import { publicEnv } from '@/shared/config';

export function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${publicEnv.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
