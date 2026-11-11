import type { ReactNode } from 'react';
import { siteConfig } from '@/shared/config';
import { themeInitScript } from '@/shared/lib/theme';
import '../styles/globals.css';

export function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={siteConfig.lang} suppressHydrationWarning>
      <head>
        {/* Ставит тёмную тему до первой отрисовки (без мигания); атрибут <html> меняется до гидрации. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link
          rel="preload"
          href="/assets/fonts/Untesis.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
