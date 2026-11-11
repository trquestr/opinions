import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Страница не найдена</h1>
        <Link href="/">На главную</Link>
      </div>
    </main>
  );
}
