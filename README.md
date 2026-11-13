# TSV Vereinsmanager · Phase 1

Geschütztes Vereins-Grundsystem für die Handballabteilung des TSV Denkendorf. Deutschsprachig, responsive und als PWA installierbar. Next.js 16, React 19, striktes TypeScript, Tailwind CSS 4, lokal gepflegte UI-Komponenten nach dem shadcn/ui-Muster, PostgreSQL 17 und Prisma 6 mit PostgreSQL-Treiberadapter. Keine kostenpflichtige API, keine Cloud-Datenbank und kein externer Anmeldedienst sind erforderlich.

## Was funktioniert?

- Persönliche Anmeldung mit scrypt-Passworthashes, zufälligen serverseitigen Sitzungen, acht Stunden Ablaufzeit und datenbankgestützter Anmeldesperre nach fünf Fehlversuchen pro Konto/15 Minuten (zusätzlich globales Limit).
- Sechs kombinierbare Rollen, Berechtigungsprüfung auf dem Server und frische Rollenprüfung bei jedem Request.
- Superadministration: Benutzerkonto anlegen, Rollen ändern, Konto deaktivieren. Zugriffsänderungen beenden alle Sitzungen des betroffenen Kontos; der letzte aktive Superadministrator bleibt geschützt.
- Sicherer CLI-Bootstrap ohne Standardpasswort; verpflichtender Passwortwechsel bei der ersten Anmeldung. Passwortänderungen beenden andere Sitzungen.
- Dashboard mit PostgreSQL-Abfragen: kommende Veranstaltungen, eigene Dienste, offene Plätze, persönliche Aufgaben und Mitteilungen; berechtigungsabhängig Finanzen, Lagerwarnungen und Teamstunden. Ohne Datensätze werden echte Leerzustände und Nullen angezeigt, keine erfundenen Vereinsdaten.
- Persönlicher JSON-Datenexport, Audit-Protokoll, responsive Navigation, Lade- und Fehlerzustände.
- Installierbare PWA mit eigenen generischen Icons. Offline wird ausschließlich eine öffentliche Hinweisseite angezeigt. Personenbezogene Seiten, APIs und Sitzungen werden niemals vom Service Worker gecacht.
- Zwei SQL-Migrationen mit 39 verknüpften Fach-/Infrastrukturtabellen, Indizes und Constraints als Grundlage für den späteren Ausbau. Lagerbewegungen sind bereits auf Datenbankebene unveränderbar und gegen negative Bestände geschützt.

**Fachmodule der Phasen 2–7 sind noch nicht umgesetzt.** Es gibt bewusst keine anklickbaren Scheinmodule. Der Ausbauplan steht im Konto-Bereich und in [docs/ROADMAP.md](docs/ROADMAP.md). Datenbanktabellen allein sind keine fertigen Fachfunktionen.

## Wichtig: Ablösung der bisherigen Aufgaben-App

Dies ist eine Serveranwendung, kein statischer Vite-Build. **GitHub Pages kann diesen Vereinsmanager nicht ausführen.** Der bisherige Quellcode ist unter `legacy/klar/` erhalten; Git-Historie und der alte Browserspeicher `klar.tasks.v1` werden nicht gelöscht oder überschrieben. Lokale Klar-Aufgaben sind nicht automatisch Vereinsdaten und werden nicht in die zentrale Datenbank hochgeladen. Bei Wechsel der Domain kann die neue App nicht auf den alten Browserspeicher zugreifen. Vor dem endgültigen Wechsel benötigte alte Aufgaben separat sichern.

Der Pages-Workflow ist durch CI ersetzt. Die letzte erfolgreich veröffentlichte Pages-Version bleibt zunächst bestehen. Eine neue Serverbereitstellung ist separat erforderlich; ein Merge allein stellt den Vereinsmanager nicht online.

## Voraussetzungen

- Node.js **24 LTS**, npm (mitgeliefert), Git
- Docker mit Compose v2 für die lokale PostgreSQL-Instanz; auf Windows 11 z. B. Docker Desktop mit WSL2, soweit dessen Lizenzbedingungen für die jeweilige Nutzung passen; alternativ Docker Engine in WSL2/Linux oder eine eigene PostgreSQL-17-Installation
- Für den Standard-Prisma-Migrationsweg Netzwerkzugriff auf `registry.npmjs.org` und `binaries.prisma.sh`; Docker benötigt Zugriff auf seine Registry

## Start unter Windows 11

Repository auschecken und ein Terminal im Projektordner öffnen:

```powershell
npm ci
npm run setup
# .env wird nur neu erstellt, falls sie noch nicht existiert.
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:admin -- --email "deine-adresse@verein.de" --name "Vorname Nachname"
npm run dev
```

Beim Admin-Befehl das neue **Startpasswort unsichtbar im Terminal** eingeben (mindestens 12 Zeichen). Es gibt keinen Demo-/Standardzugang. Danach `http://localhost:3000` öffnen, anmelden und ein neues persönliches Passwort setzen. Nach diesem Wechsel unter **Benutzer & Rollen** weitere persönliche Zugänge anlegen. Startpasswörter sicher und getrennt weitergeben.

`npm run setup` erzeugt ein zufälliges Datenbankpasswort in der ignorierten `.env`. Nutzt du eine eigene PostgreSQL-Installation, `DATABASE_URL` in `.env` anpassen. `.env.example` dokumentiert die Felder und enthält nur Platzhalter. Keine Geheimnisse committen. Ein vorhandenes Docker-Datenvolume behält sein ursprüngliches Passwort; eine Änderung in `.env` allein ändert es nicht. **Kein `docker compose down -v` auf einer Datenbank mit benötigten Daten verwenden.**

## GitHub Codespaces / VS Code

Die enthaltene `.devcontainer/devcontainer.json` stellt Node.js und Docker-Unterstützung bereit. Im Codespace-Terminal die gleichen Befehle ab `npm run setup` ausführen; `npm ci` läuft bereits beim Erstellen. Port **3000 privat** weiterleiten. `npm run setup` erkennt neue Codespaces und setzt deren HTTPS-Adresse als `APP_URL` und sichere Cookies. Wird eine vorhandene `.env` wiederverwendet oder die Port-Adresse geändert, `APP_URL` auf die aktuelle, vollständige Adresse ohne Pfad setzen und den Server neu starten.

Codespaces verwendet GitHub-Ressourcen. Freikontingent und Ausgabenlimit im eigenen Konto prüfen; der Code setzt keinen kostenpflichtigen Tarif voraus und richtet keine bezahlten Ressourcen ein. Codespaces ist eine Entwicklungsumgebung, kein dauerhafter Vereinsserver.

## Prüfungen

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

Den Prisma-Client vor TypeScript/Build mit `npm run db:generate` erstellen. Nach Schemaänderungen erneut generieren. Build benötigt keine erreichbare Datenbank; die geschützten Seiten werden erst pro Request auf dem Server geladen. `GET /api/health` prüft die Datenbankverbindung ohne persönliche Daten und liefert 200 bzw. 503.

### Integrationstests (separate Datenbank!)

Die Tests verändern Daten und dürfen ausschließlich eine eigene Datenbank mit Namen-Suffix `_test` verwenden. Beispiel mit der lokalen Docker-Datenbank:

```sh
docker compose exec db createdb -U tsv tsv_test
```

In einem separaten Terminal `DATABASE_URL` vorübergehend auf dieselbe Verbindungsadresse mit Datenbankname `tsv_test` setzen und `npm run db:migrate` ausführen. Danach `TEST_DATABASE_URL` auf diese Testadresse setzen und `npm run test:integration` starten. Der Testrunner überschreibt nur für seinen Kindprozess `DATABASE_URL`. Beide URLs enthalten Zugangsdaten: nur lokal setzen, nicht committen und nicht in Logs ausgeben. Unter PowerShell: `$env:TEST_DATABASE_URL = '…'`; unter Bash: `export TEST_DATABASE_URL='…'`.

Tests erzeugen ausschließlich als `DEMO` markierte Daten mit `example.test`-Adressen. Sie prüfen Authentifizierung, Sitzungssicherheit, Rate-Limit, Rollenprüfung, Schutz des letzten Superadmins, Abgrenzung der Dashboard-Daten und Lager-Constraints. Die Datenbank kann für den nächsten Testlauf wiederverwendet werden.

### Eingeschränkte Cloud-Netze

Falls `binaries.prisma.sh` gesperrt ist, kann **nur für die Client-Generierung** `npm run db:generate:wasm` verwendet werden. Die optionale `prisma.cloud.config.ts` nutzt die experimentelle JavaScript-CLI-Adapter-Schnittstelle aus Prisma 6. Der Runtime-Query-Compiler und PostgreSQL-Treiberadapter sind reguläre Prisma-Funktionen. Für produktive Migrationen weiterhin den Standardbefehl **`npm run db:migrate`** und den offiziellen Engine-Download verwenden. Die optionale Adapter-Migrationsausführung ist wegen eines PostgreSQL-Katalogtyp-Problems nicht freigegeben. Niemals TLS- oder Prüfsummenprüfung deaktivieren.

## Eigener Server / produktiver Betrieb

1. Einen vorhandenen Linux-Server mit Docker und persistentem Datenträger verwenden. Domain und HTTPS-Reverse-Proxy (z. B. Caddy) einrichten. Es werden keine Hostingressourcen automatisch angelegt.
2. `.env` lokal auf dem Server erstellen, starkes DB-Passwort wählen, `APP_URL=https://deine-vereinsdomain.de` und **`SESSION_SECURE=true`** setzen. Bei Codespaces ebenfalls HTTPS verwenden.
3. `docker compose up -d db`, auf gesunde Datenbank warten, vor Updates Backup erstellen und `npm ci && npm run db:generate && npm run db:migrate` mit passender Server-Datenbankadresse ausführen. Migrationen werden absichtlich nicht parallel bei jedem App-Start ausgeführt.
4. Bei Erstinstallation `npm run db:admin -- --email … --name …` ausführen.
5. `docker compose --profile production up -d --build` startet App, Datenbank und täglichen Backup-Dienst. App-Port 3000 und DB-Port 5432 sind nur an `127.0.0.1` gebunden. Den HTTPS-Reverse-Proxy auf `127.0.0.1:3000` richten; Origin und Host korrekt weiterreichen.
6. `https://deine-vereinsdomain.de/api/health` prüfen, anmelden, Rollen und Backups prüfen. Der Server muss dauerhaft laufen. Strom, Internetzugang und gegebenenfalls Hosting können eigene Kosten verursachen; die Software benötigt keine bezahlten Dienste.

Der Produktionscontainer läuft als unprivilegierter `node`-Benutzer. Datenbankzugriff außerhalb des Servers ist standardmäßig nicht freigegeben. Für eine gehärtete Installation einen separaten, eingeschränkten Laufzeit-Datenbankbenutzer und einen separaten Migrationsbenutzer einrichten. HTTPS, gesicherte Backups und Betrieb durch eine verantwortliche Person sind vor echten Mitgliederdaten notwendig.

## PWA installieren

Produktive Adresse über HTTPS öffnen. **iPhone:** Safari → Teilen → Zum Home-Bildschirm. **Android / Windows:** Chrome oder Edge → App installieren. Ohne Verbindung erscheint eine klare Offline-Meldung; geschützte Daten sind nur online verfügbar. Ein Service Worker ersetzt keine sichere Session und keine Datenbanksicherung.

## Backups und Datenschutz

Siehe [docs/OPERATIONS.md](docs/OPERATIONS.md) für automatische Sicherung, getestete Wiederherstellung, Bereinigung, Löschkonzept und Zugriffsmodell. Der Backup-Dienst sichert sofort beim Start und danach täglich, prüft die Archivstruktur und entfernt lokale Sicherungen nach 30 Tagen. Für Schutz vor Serverausfall verschlüsselte Kopien auf einem zweiten Datenträger/Standort einrichten. Sicherungen enthalten personenbezogene Daten und sind kein öffentliches Downloadverzeichnis.

Die spätere Verkaufserfassung wird eine interne Organisationslösung. Sie ist kein geprüftes steuerrechtlich konformes Kassensystem und keine vollständige Vereinsbuchhaltung. Diese Fachfunktionen gehören nicht zu Phase 1.
