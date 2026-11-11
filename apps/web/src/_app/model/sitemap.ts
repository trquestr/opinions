import type { MetadataRoute } from 'next';
import { publicEnv } from '@/shared/config';

// Новую публичную страницу добавлять сюда.
export function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/`, changeFrequency: 'weekly', priority: 1 }];
}
