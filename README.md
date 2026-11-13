# Klar · Deine Aufgaben

Eine kostenlose, deutschsprachige Aufgaben-PWA mit React, TypeScript und Vite. Responsive für iPhone und Windows, ohne Konto, Backend, Werbung oder externe Laufzeitdienste.

## Entwicklung

Voraussetzung: Node.js 22.12+ (oder 20.19+) und npm.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

`npm run build` prüft TypeScript und erstellt `dist/` einschließlich Web-App-Manifest und Service Worker. Der Service Worker ist nur im Produktionsbuild aktiv. Die Vite-Server dienen der lokalen Entwicklung, nicht dem produktiven Hosting.

## Funktionen

- Aufgaben erstellen, bearbeiten, löschen, erledigen und wieder öffnen
- Notizen, Fälligkeitsdatum, hohe Priorität, Suche und Ansichten für offene, heutige und erledigte Aufgaben
- Speicherung in `localStorage`, inklusive Fehlermeldungen bei nicht verfügbarem oder beschädigtem Speicher
- Offline nutzbar nach dem ersten erfolgreichen Laden des Produktionsbuilds
- Eigene PNG-Icons einschließlich iPhone- und Maskable-Icon, keine externen Fonts

## Installation und Hosting

Den Inhalt von `dist/` auf einem statischen **HTTPS**-Host bereitstellen. Kostenlose statische Hostingangebote sind ausreichend; es werden keine kostenpflichtigen Dienste benötigt. Relative Asset-Pfade erlauben auch ein Hosting in einem Unterverzeichnis. Manifest, Icons und Service Worker müssen dort unverändert erreichbar sein.

**iPhone:** In Safari öffnen → Teilen → „Zum Home-Bildschirm“. **Windows:** In Edge oder Chrome öffnen → Installationssymbol in der Adressleiste bzw. „App installieren“ im Browsermenü. Installation und Offlinebetrieb benötigen HTTPS (für lokale Entwicklung ist localhost ebenfalls zulässig).

**Offlineprüfung:** Produktionsbuild über `npm run preview` öffnen, Service-Worker-Aktivierung abwarten, Seite erneut laden, Netzwerk im Browser auf offline stellen und neu laden. Aufgaben erstellen, bearbeiten und erledigen; nach erneutem Laden müssen sie erhalten bleiben.

Daten verbleiben pro Browser, Gerät und Websiteadresse. Es gibt keine Synchronisierung oder Sicherung. Das Löschen der Websitedaten entfernt die Aufgaben. Privates Surfen kann die Speicherung einschränken. Der Service Worker speichert die App-Dateien; Aufgaben werden ausschließlich im lokalen Browserspeicher gehalten.
