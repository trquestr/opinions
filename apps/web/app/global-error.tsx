"use client";

import { useEffect } from "react";

// Ошибка в корневом layout: заменяет его целиком, поэтому свои <html>/<body>.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 16 }}>Что-то пошло не так</h1>
            <button type="button" onClick={() => retry()} style={{ padding: "8px 20px", cursor: "pointer" }}>
              Попробовать снова
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
