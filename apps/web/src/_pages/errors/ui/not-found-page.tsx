import Link from 'next/link';
import { buttonStyles } from '@/shared/ui';

export function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl">Страница не найдена</h1>
        <Link href="/" className={buttonStyles({ variant: 'secondary' })}>
          На главную
        </Link>
      </div>
    </main>
  );
}
