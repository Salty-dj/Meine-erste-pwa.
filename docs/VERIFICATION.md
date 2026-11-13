# Verifikation der Phase 1

Die folgenden Prüfungen wurden in der Cloud-Entwicklungsumgebung ausgeführt. Sie belegen keine bereits erfolgte Bereitstellung auf einem Vereinsserver.

| Prüfung                                                            | Ergebnis                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| ESLint                                                             | Erfolgreich, ohne Warnungen                                                                                                  |
| TypeScript strict                                                  | Erfolgreich                                                                                                                  |
| Produktionsbuild mit Next.js                                       | Erfolgreich, Standalone-Ausgabe einschließlich statischer Dateien                                                            |
| Unit-Tests                                                         | 4 erfolgreich                                                                                                                |
| Integrationstests gegen separate PostgreSQL-17-Datenbank           | 8 erfolgreich                                                                                                                |
| Beide SQL-Migrationen mit `psql` auf leeren Datenbanken angewendet | Erfolgreich                                                                                                                  |
| Standard `prisma migrate deploy`                                   | In dieser Cloud-Umgebung durch fehlende Netzwerkfreigabe für `binaries.prisma.sh` blockiert; im Zielsystem/CI noch zu prüfen |
| Optionale experimentelle CLI-Adaptermigration                      | Nicht freigegeben: PostgreSQL-Katalogtyp `name` wird in diesem Pfad nicht unterstützt                                        |
| Client-Generierung über optionalen WASM-Pfad                       | Erfolgreich, regulärer Prisma-Client mit PostgreSQL-Treiberadapter                                                           |
| `/api/health`                                                      | HTTP 200 mit echter DB-Verbindung                                                                                            |
| Headless Chromium mit 1440px und 390px                             | Erfolgreich, ohne horizontalen Überlauf                                                                                      |
| Browser: Login, erzwungener Passwortwechsel, Benutzeranlage        | Erfolgreich                                                                                                                  |
| Browser: Mitglied hat keinen Benutzerverwaltungszugriff            | Erfolgreich, keine fremden Kontodaten in der Antwort                                                                         |
| Browser: persönlicher Export und Cookie-Flags                      | Erfolgreich; keine Passwort-Hashes im Export, HttpOnly und SameSite=Lax gesetzt                                              |
| Browser: PWA-Service-Worker und Offline-Hinweis                    | Erfolgreich; Cache enthält ausschließlich öffentliche Hinweisseite und Icons                                                 |
| Browser: Abmeldung                                                 | Erfolgreich                                                                                                                  |
| PostgreSQL-Custom-Backup und Restore in neue Datenbank             | Erfolgreich; Benutzer, Rollen und Audit-Einträge vorhanden                                                                   |
| Automatischer Backup-Dienst                                        | Gestartet; erste Sicherung erfolgreich erzeugt                                                                               |
| Docker-Compose-Konfigurationsprüfung                               | Erfolgreich                                                                                                                  |
| Vollständiger Docker-App-Image-Build                               | Nicht ausgeführt; native Prisma-Enginefreigabe fehlt                                                                         |
| Physische iPhone-/Android-/Windows-Geräte                          | Nicht getestet                                                                                                               |
| Öffentliches Hosting / produktive Freischaltung                    | Noch nicht eingerichtet                                                                                                      |

Die Tests decken auch parallele Superadmin-Demotierungen und gleichzeitige Entnahmen des letzten Lagerartikels ab. In beiden Fällen bleibt die Integrität erhalten. Fixtures heißen ausdrücklich `DEMO` und verwenden `example.test`; sie sind keine echten Vereinsdaten.

Lokale Validierungsdatenbanken wurden per SQL aufgebaut, weil die native Migrationsengine nicht erreichbar war; ihre Prisma-Migrationshistorie ist deshalb kein Vorbild für Produktivbetrieb. Für den produktiven Start immer eine regulär mit `npm run db:migrate` verwaltete Datenbank verwenden. Keine experimentelle Adaptermigration und keine manuell fingierte Prisma-Historie einsetzen.
