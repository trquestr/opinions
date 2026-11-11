import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RootLayout } from './root-layout';

afterEach(cleanup);

describe('RootLayout', () => {
  it('рендерит дочерние элементы', () => {
    const { getByText } = render(<RootLayout>контент</RootLayout>, {
      container: document.createElement('div'),
    });
    expect(getByText('контент')).toBeTruthy();
  });
});
