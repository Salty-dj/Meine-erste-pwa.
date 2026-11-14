# Verifikation der Phase 1

Die folgenden Prüfungen wurden in der Cloud-Entwicklungsumgebung ausgeführt. Sie belegen keine bereits erfolgte Bereitstellung auf einem Vereinsserver.

| Prüfung                                                            | Ergebnis                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| ESLint                                                             | Erfolgreich, ohne Warnungen                                                                                   |
| TypeScript strict                                                  | Erfolgreich                                                                                                   |
| Produktionsbuild mit Next.js                                       | Erfolgreich, Standalone-Ausgabe einschließlich statischer Dateien                                             |
| Unit-Tests                                                         | 8 erfolgreich (einschließlich Render-/Supabase-Konfiguration und TLS-Übersetzung)                             |
| Integrationstests gegen separate PostgreSQL-17-Datenbank           | 9 erfolgreich (einschließlich Bootstrap-Schutz)                                                               |
| Beide SQL-Migrationen mit `psql` auf leeren Datenbanken angewendet | Erfolgreich                                                                                                   |
| Standard `prisma migrate deploy`                                   | Erfolgreich: alle drei Migrationen auf leerer PostgreSQL-17-Datenbank und erneut ohne ausstehende Migrationen |
| Optionale experimentelle CLI-Adaptermigration                      | Nicht freigegeben: PostgreSQL-Katalogtyp `name` wird in diesem Pfad nicht unterstützt                         |
| Client-Generierung über optionalen WASM-Pfad                       | Erfolgreich, regulärer Prisma-Client mit PostgreSQL-Treiberadapter                                            |
| `/api/health`                                                      | HTTP 200 mit echter DB-Verbindung                                                                             |
| Headless Chromium mit 1440px und 390px                             | Erfolgreich, ohne horizontalen Überlauf                                                                       |
| Browser: Login, erzwungener Passwortwechsel, Benutzeranlage        | Erfolgreich                                                                                                   |
| Browser: Mitglied hat keinen Benutzerverwaltungszugriff            | Erfolgreich, keine fremden Kontodaten in der Antwort                                                          |
| Browser: persönlicher Export und Cookie-Flags                      | Erfolgreich; keine Passwort-Hashes im Export, HttpOnly und SameSite=Lax gesetzt                               |
| Browser: PWA-Service-Worker und Offline-Hinweis                    | Erfolgreich; Cache enthält ausschließlich öffentliche Hinweisseite und Icons                                  |
| Browser: Abmeldung                                                 | Erfolgreich                                                                                                   |
| PostgreSQL-Custom-Backup und Restore in neue Datenbank             | Erfolgreich; Benutzer, Rollen und Audit-Einträge vorhanden                                                    |
| Automatischer Backup-Dienst                                        | Gestartet; erste Sicherung erfolgreich erzeugt                                                                |
| Docker-Compose-Konfigurationsprüfung                               | Erfolgreich                                                                                                   |
| Vollständiger Docker-App-Image-Build                               | Nicht ausgeführt; für Render Native wird der geprüfte Node-/Standalone-Build verwendet                        |
| Physische iPhone-/Android-/Windows-Geräte                          | Nicht getestet                                                                                                |
| Öffentliches Hosting / produktive Freischaltung                    | Noch nicht eingerichtet                                                                                       |

Die Tests decken auch parallele Superadmin-Demotierungen und gleichzeitige Entnahmen des letzten Lagerartikels ab. In beiden Fällen bleibt die Integrität erhalten. Fixtures heißen ausdrücklich `DEMO` und verwenden `example.test`; sie sind keine echten Vereinsdaten.

Lokale Validierungsdatenbanken wurden per SQL aufgebaut, weil die native Migrationsengine nicht erreichbar war; ihre Prisma-Migrationshistorie ist deshalb kein Vorbild für Produktivbetrieb. Für den produktiven Start immer eine regulär mit `npm run db:migrate` verwaltete Datenbank verwenden. Keine experimentelle Adaptermigration und keine manuell fingierte Prisma-Historie einsetzen.

## Zusätzliche Render-/Supabase-Prüfungen

- Der originale `feat/tsv-vereinsmanager`-Remote-Branch wurde mit Commit `721ab8b` abgeglichen. Die Arbeiten erfolgen ausschließlich auf `feat/render-supabase`.
- Offizielle native Prisma-Clientgenerierung und drei reguläre, versionierte Migrationen erfolgreich. Keine Migration wurde zurückgesetzt, umgeschrieben oder als angeblich angewendet eingetragen.
- Frisches eigenes Datenbankschema: Migration, Bootstrap, Runtime-Zugriff und Lager-Trigger erfolgreich. Bestehende Daten im Standardschema bleiben getrennt.
- Supabase-API-Rollen lokal nachgebildet: bestehende Standardgrants werden für bekannte App-Tabellen entzogen und RLS aktiviert. Der serverseitige Owner-Zugriff funktioniert weiter. Es wurden keine echten Supabase-Zugangsdaten verwendet.
- TLS-Negativtest: native Migration mit verifizierter TLS-Anforderung verweigert einen PostgreSQL-Server ohne TLS. Keine Zertifikats-/TLS-Prüfung deaktiviert.
- Render-Startablauf mit `PORT=4180` und HTTPS-APP_URL erfolgreich: native Migration, erstmaliger Adminbootstrap, HTTP-Healthcheck und Anmeldeseite. Wiederholter Start lässt Benutzer-ID und Passwort-Hash unverändert. Die Startlogs enthalten das Bootstrap-Passwort nicht.
- Acht Unit- und neun Integrationstests bestanden. Linting, Typprüfung und Render-Produktionsbuild erfolgreich.
- Es gibt keine Änderung an `.github/`, `legacy/`, den bisherigen öffentlichen Website-Dateien oder dem GitHub-Pages-Branch `main` durch diesen Render-Patch.

Noch offen: tatsächliche Render-/Supabase-Projektbereitstellung und Verbindung mit den realen, ausschließlich dort zu hinterlegenden Zugangsdaten. Es werden keine erfolgreichen Live-Supabase-Verbindungen oder bereits veröffentlichte Render-Dienste behauptet.
