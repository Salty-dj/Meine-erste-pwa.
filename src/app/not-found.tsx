import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="error-page">
      <h1>Diese Seite gibt es nicht.</h1>
      <p>Die Fachmodule werden schrittweise ergänzt.</p>
      <Link href="/">Zurück zum Dashboard →</Link>
    </main>
  );
}
