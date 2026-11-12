'use client';

import { useEffect } from 'react';
import { startSmoothScroll } from '../lib/smooth-scroll';

/**
 * Включает мягкий инерционный скролл на клиенте после гидрации.
 */
export function SmoothScrollDriver() {
  useEffect(() => {
    return startSmoothScroll();
  }, []);

  return null;
}
