"use client";

import { useEffect } from "react";

// Граница ошибок сегмента. В Next 16 рекомендуемый способ восстановления — retry()
// (перезапрос и повторный рендер сегмента); reset() остаётся для особых случаев.
export default function Error({
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
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Что-то пошло не так</h1>
        <button type="button" onClick={() => retry()} style={{ padding: "8px 20px", cursor: "pointer" }}>
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
