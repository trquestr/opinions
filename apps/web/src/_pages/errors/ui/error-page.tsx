'use client';

import { useEffect } from 'react';
import { Button } from '@/shared/ui';

// Граница ошибок сегмента. В Next 16 рекомендуемый способ восстановления — retry()
// (перезапрос и повторный рендер сегмента); reset() остаётся для особых случаев.
export function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // digest связывает это сообщение с серверным логом.
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl">Что-то пошло не так</h1>
        <Button onClick={() => retry()}>Попробовать снова</Button>
      </div>
    </main>
  );
}
