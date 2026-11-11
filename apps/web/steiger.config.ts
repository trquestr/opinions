import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Слои `_app`/`_pages` (гайд FSD для Next) Steiger распознаёт как app/pages — порядок импортов и
    // публичные API на них проверяются (fsd/forbidden-imports проверено). Ложно срабатывает только правило
    // опечаток в имени слоя, поэтому выключены лишь эти две проверки и только для этих папок.
    files: ['./src/_app/**', './src/_pages/**'],
    rules: {
      'fsd/typo-in-layer-name': 'off',
      // Слой `app` не должен иметь сегмент ui — но у `_app` это корневой RootLayout (по гайду FSD для Next).
      'fsd/no-ui-in-app': 'off',
    },
  },
  {
    // разместим в шапке позже по решению владельца
    files: ['./src/features/theme-switch/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
]);
