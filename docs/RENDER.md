# Render Free mit Supabase PostgreSQL

Dieses Dokument gilt für Branch **`feat/render-supabase`**. Er basiert auf `feat/tsv-vereinsmanager`. Das Repository enthält die Next.js-App direkt im Stammverzeichnis, also **kein** `frontend/`- oder `backend/`-Root. Render und GitHub Pages sind getrennte Dienste. Der Branch wird für Render verwendet und für diese Bereitstellung nicht in `main` zusammengeführt. Dadurch bleiben die bestehende Pages-Website und ihre Quelle unverändert.

## Genaue Render-Einstellungen

In Render **New → Web Service**, GitHub-Repository verbinden:

| Feld               | Wert                                           |
| ------------------ | ---------------------------------------------- |
| Branch             | `feat/render-supabase`                         |
| Language / Runtime | `Node`                                         |
| Region             | Möglichst nahe der Supabase-Projektregion      |
| Instance Type      | `Free`                                         |
| Root Directory     | **Leer lassen**                                |
| Build Command      | `npm ci --include=dev && npm run render:build` |
| Start Command      | `npm run render:start`                         |
| Auto-Deploy        | After CI Checks Pass                           |
| Health Check Path  | `/api/health`                                  |

Der Build generiert den Prisma-Client und baut Next.js einschließlich Standalone-Dateien, Assets und Icons. `--include=dev` wird benötigt, weil TypeScript, Prisma CLI und `tsx` zum Build bzw. zur Migration/Ersteinrichtung benötigt werden. Nicht anschließend `npm prune --omit=dev` ausführen.

Vor dem Öffnen des HTTP-Ports prüft `npm run render:start` den Migrationsstatus mit `prisma migrate status`. Bei ausstehenden oder fehlerhaften Migrationen bricht der neue Start ab. Bei aktuellem Schema startet der Server auf **`0.0.0.0:$PORT`**. Render setzt `PORT` automatisch.

Alternativ ist eine `render.yaml`-Blueprint-Datei enthalten. Sie enthält ausschließlich öffentliche Konfiguration und Eingabefelder für geheime Werte; sie erstellt nicht automatisch Ressourcen in diesem Arbeitsschritt. `DIRECT_URL` bei Bedarf im Render-Dashboard ergänzen.

## Environment Variables: nur in Render eintragen

| Name              | Wert / Bedeutung                                                                             | Pflicht               |
| ----------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| `DATABASE_URL`    | Supabase **Session pooler**, Port **5432**, mit Datenbankpasswort; siehe unten               | Ja                    |
| `APP_URL`         | Exakte öffentliche HTTPS-Origin, z. B. `https://dein-dienst.onrender.com`, ohne Unterpfad    | Ja                    |
| `SESSION_SECURE`  | `true`                                                                                       | Ja                    |
| `NODE_ENV`        | `production`                                                                                 | Ja                    |
| `NODE_VERSION`    | `24`                                                                                         | Ja                    |
| `DB_POOL_MAX`     | `3` (kleiner serverseitiger Pool für diesen Dienst)                                          | Empfohlen, Standard 3 |
| `DIRECT_URL`      | Eigene Session-/Direktverbindung für Migrationen, wenn sie von `DATABASE_URL` abweichen soll | Optional              |

`DIRECT_URL` wird für die Prisma-Migration und deren Statusprüfung verwendet. Ohne `DIRECT_URL` verwendet er `DATABASE_URL`. Eine gesetzte falsche `DIRECT_URL` kann Migrationen auf der falschen Datenbank ausführen: beide Verbindungen müssen auf dieselbe Datenbank und dasselbe Schema zeigen. Die App selbst verwendet ausschließlich `DATABASE_URL` und berücksichtigt dessen `schema`-Parameter auch im PostgreSQL-Treiberadapter.

**Nicht benötigt:** Supabase-URL/API-Key, Anon-Key, Service-Role-Key, `NEXTAUTH_SECRET`, `AUTH_SECRET` oder ein zusätzliches Session-Secret. Diese App verwendet eigene zufällige, serverseitige Sessions statt Auth.js. `DB_PASSWORD` gehört nur zur lokalen Docker-Konfiguration. Nie eine Datenbankadresse oder ein Passwort mit `NEXT_PUBLIC_` veröffentlichen. Zugangsdaten weder in YAML noch `.env.example`, Issues, Pull Requests oder Chat speichern.

## Supabase-Verbindung

1. Im Supabase-Projekt **Connect → Session pooler** wählen; nicht die URL des Data API kopieren.
2. Den dort angezeigten Host, Benutzernamen (häufig `postgres.PROJEKTREFERENZ`) und Datenbanknamen exakt übernehmen. Passwort in der URL korrekt URL-kodieren; Sonderzeichen wie `@`, `#`, `%` oder `/` dürfen nicht unverändert als Strukturzeichen in der URL stehen.
3. Ein **leeres, ausschließlich dafür vorgesehenes Projekt oder Schema** verwenden. Keine fremden vorhandenen Tabellen löschen oder mit `migrate reset` arbeiten.
4. TLS mit Serverprüfung verwenden. Mit der aktuellen `pg`-Version unterstützt `sslmode=verify-full` ausdrücklich vollständige Zertifikatsprüfung; die native Prisma-Engine verwendet für dieselbe Absicht `sslmode=require` zusammen mit `sslaccept=strict`. Falls eine private CA erforderlich ist, den offiziellen Supabase-CA-Nachweis vertrauen und korrekt konfigurieren; keine Zertifikatsprüfung abschalten.

Beispielstruktur für die Runtime (nur Platzhalter, nicht kopierfertige Zugangsdaten):

```text
postgresql://postgres.PROJEKTREFERENZ:URL_KODIERTES_PASSWORT@SESSION_POOLER_HOST:5432/postgres?schema=public&sslmode=verify-full
```

Das Migrationsskript übersetzt `sslmode=verify-full` für die native Prisma-6-Engine automatisch in **`sslmode=require&sslaccept=strict`**. Das ist nötig, weil der native Client unbekannte SSL-Modi andernfalls als Fallback behandeln kann. Die Runtime behält die ursprüngliche `verify-full`-Adresse. Daher ist `DIRECT_URL` für diesen Unterschied **nicht** erforderlich. Eine eigene `DIRECT_URL` ist nur nötig, wenn tatsächlich eine andere Session-/Direktverbindung verwendet werden soll. Host, Datenbank und Schema müssen identisch bleiben. Nie `sslaccept=accept_invalid_certs`, `rejectUnauthorized=false` oder TLS-Deaktivierung verwenden.

Die direkte Supabase-Adresse `db.…supabase.co` ist je nach Projekt nur über IPv6 erreichbar. Deshalb ist der **IPv4-kompatible Session pooler auf Port 5432** der unkomplizierte Ausgangspunkt für Render. **Port 6543 ist der Transaction pooler und wird für Migrationen abgelehnt.** Transaktionspooling für die Runtime ist erst nach separater Prüfung vorgesehen; keine `pgbouncer=true`- oder Verbindungslimit-Parameter aus alten Rust-Engine-Anleitungen blind übernehmen. Der hier verwendete Prisma-PostgreSQL-Treiberadapter erhält seine Poolgröße über `DB_POOL_MAX`.

Die zusätzliche, additive Migration schützt nur die bekannten Anwendungstabellen vor den Supabase-Data-API-Rollen `anon` und `authenticated` und aktiviert Row Level Security ohne öffentliche Policies. Die bestehende serverseitige Anmeldung arbeitet weiterhin mit dem PostgreSQL-Serverkonto (Tabellenbesitzer oder passend berechtigte BYPASSRLS-Rolle); sie verwendet nicht die Supabase-Anon-Rolle. Andere Tabellen/Projekte und frühere Migrationen werden nicht verändert. Für ein individuelles Nicht-Owner-Laufzeitkonto müssen passende Serverrechte und RLS-Policies separat eingerichtet werden.

Bei einem eigenen Schema z. B. `?schema=tsv` in **beiden** URLs verwenden. Die neue Migration fixiert außerdem den `search_path` der Lager-Trigger auf das Migrationsschema. Standardmäßig bleibt für bestehende Installationen `public` erhalten; es findet kein automatisches Verschieben vorhandener Daten statt.

## Supabase-CA als Render Secret File

Unter **Render → Environment → Secret Files** das offizielle Supabase-CA-Zertifikat im PEM-Format mit dem Dateinamen **`supabase-ca.crt`** hinterlegen. Render stellt es unter **`/etc/secrets/supabase-ca.crt`** bereit. Diese Datei wird automatisch erkannt; Build- und Startbefehl bleiben unverändert.

Optional kann **`DB_SSL_CA_FILE=/etc/secrets/supabase-ca.crt`** gesetzt werden, um den Pfad ausdrücklich vorzugeben. Bei einem ausdrücklich gesetzten, aber nicht lesbaren oder ungültigen Zertifikat wird abgebrochen, statt stillschweigend auf andere Vertrauenseinstellungen zurückzufallen. Ohne Datei und ohne diese Variable bleibt der bisherige lokale/System-CA-Betrieb unverändert.

- **Native Prisma-Migrationen**: Die CA-Datei wird sowohl bei `DATABASE_URL` als auch bei einer separaten `DIRECT_URL` mit `sslcert=<absoluter Dateipfad>` eingebunden. Es werden zwingend `sslmode=require` und `sslaccept=strict` verwendet.
- **Node.js / pg / PrismaPg**: Der Dateiinhalt wird als `ssl.ca` mit **`rejectUnauthorized: true`** geladen. SSL-URL-Parameter, die dieses explizite Objekt im pg-Treiber überschreiben könnten, werden aus der Runtime-Verbindungsadresse entfernt. TLS bleibt durch das explizite SSL-Objekt vorgeschrieben; die Standardprüfung des Hostnamens bleibt aktiv.
- Das Vertrauen ist auf die Datenbankverbindung beschränkt. Es wird weder `NODE_TLS_REJECT_UNAUTHORIZED=0` gesetzt noch die globale Node-Zertifikatsprüfung verändert. `NODE_EXTRA_CA_CERTS` ist für diesen Datenbankpfad nicht erforderlich.

Das echte Zertifikat und sämtliche Zugangsdaten bleiben in Render, nicht im Repository. Neue Commits werden automatisch bereitgestellt, sobald die GitHub-Checks erfolgreich sind. Bei weiterhin fehlerhafter Kette CA-Datei, PEM-Format und zum Supabase-Projekt passenden Pooler-Host prüfen; niemals die Prüfung abschalten.

## Migrationen und erster Administrator

GitHub Actions führt Migrationen und Integrationstests gegen eine temporäre PostgreSQL-Datenbank aus. Produktive Änderungen benötigen eine separate Freigabe.

1. Die SQL-Dateien der ausstehenden Migrationen am genauen Commit prüfen und CI abwarten.
2. Nach Freigabe eine Sicherung anlegen. Auf einem vertrauenswürdigen Rechner den geprüften Commit auschecken, `npm ci` ausführen und die Supabase-Verbindung mit TLS-Prüfung lokal und vertraulich konfigurieren. Bei eigener CA-Datei `DB_SSL_CA_FILE` setzen.
3. Am geprüften Commit `npm run db:migrate` ausführen. Wenn der vorherige Deploy wegen ausstehender Migrationen abgebrochen ist, in Render **Manual Deploy → Deploy latest commit** verwenden, sobald der aktuelle Branch-Commit der geprüften Version entspricht.
4. In Render den erfolgreichen Start und `/api/health` prüfen.

Falls bei einer Neuinstallation ein erster Administrator fehlt, nach Freigabe auf dem vertrauenswürdigen Rechner mit derselben Datenbankverbindung und nach `npm run db:generate` den Befehl `npm run db:admin` ausführen. Der Webserverstart legt keine Benutzer an.

## Grenzen des Free-Betriebs

- Render Free kann bei Inaktivität einschlafen. Erster Aufruf und Healthcheck können nach einer Pause länger dauern.
- Kein lokaler Dateispeicher darf für Vereinsdaten oder Backups genutzt werden; Deploys und Neustarts sind nicht persistent. Die App speichert ihre Daten in Supabase. Docker-Compose-Backupcontainer und Zeitpläne laufen auf Render Native nicht automatisch mit.
- Supabase-Free-Projekte können eigene Pausen, Quoten und Sicherungsgrenzen haben. Freikontingente beider Anbieter prüfen; für verlässliche Sicherungen `npm run db:backup` auf einem vertrauenswürdigen externen Rechner/Zeitplan gegen die Session-Verbindung verwenden und verschlüsselt extern ablegen. Keine automatische kostenlose Sicherung durch Render behaupten.
- Persönliche Daten werden nicht im PWA-Cache gespeichert. Die geschützte App benötigt eine Netzwerkverbindung.

Es wurden keine kostenpflichtigen Ressourcen eingerichtet. Die Einrichtung im Render-/Supabase-Konto und die Eingabe der realen Zugangsdaten bleiben beim Betreiber.
