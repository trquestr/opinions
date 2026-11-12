import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmoothScrollDriver } from './smooth-scroll-driver';

describe('SmoothScrollDriver', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('монтируется и размонтируется без ошибок', () => {
    const { unmount } = render(<SmoothScrollDriver />);
    expect(() => unmount()).not.toThrow();
  });
});
