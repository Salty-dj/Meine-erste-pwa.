"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="error-page">
      <h1>Das hat gerade nicht geklappt.</h1>
      <p>
        Die Daten konnten nicht geladen werden oder dein Zugriff ist nicht
        freigegeben. Es wurden keine Änderungen vorgenommen.
      </p>
      <Button onClick={reset}>Erneut versuchen</Button>
      <a href="/konto">Mein Konto öffnen</a>
      <p>
        Bleibt der Fehler bestehen, wende dich bitte an die
        Vereinsadministration.
      </p>
    </main>
  );
}
