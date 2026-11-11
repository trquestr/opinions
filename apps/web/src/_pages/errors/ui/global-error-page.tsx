'use client';

import { useEffect } from 'react';
import { siteConfig } from '@/shared/config';
import { themeInitScript } from '@/shared/lib/theme';
import { Button } from '@/shared/ui';

// Ошибка в корневом layout: заменяет его целиком, поэтому свои <html>/<body>.
export function GlobalErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={siteConfig.lang} suppressHydrationWarning>
      {/* App Router: <head> в собственном <html> global-error — штатный способ; Head из next/head тут не работает. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-background text-foreground">
        <main className="grid min-h-dvh place-items-center p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-2xl">Что-то пошло не так</h1>
            <Button onClick={() => retry()}>Попробовать снова</Button>
          </div>
        </main>
      </body>
    </html>
  );
}
