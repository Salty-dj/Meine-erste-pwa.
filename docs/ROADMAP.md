# Ausbauplan

## Phase 1 – Grundsystem

Implementiert: Next.js/TypeScript/Tailwind, PostgreSQL-Prisma-Schema, versionierte SQL-Migrationen, passwortbasierte Anmeldung, sichere Sitzungen, kombinierbare Rollen, CLI-Adminbootstrap, verpflichtender erster Passwortwechsel, Benutzer-/Rollenverwaltung, Dashboard aus echten Datenbankabfragen, PWA, Export eigener Profildaten, Audit-Log, Backup-/Wiederherstellungsanleitung, Windows-/Codespaces-Anleitung und CI.

Schemaentitäten für spätere Phasen sind vorbereitet. Deren Oberflächen und Buchungsabläufe sind noch nicht freigegeben. Es gibt keine angeblich fertigen Platzhalterseiten und keine Produktiv-Demodatensätze.

Abnahme: Client generieren, beide Migrationen auf einer leeren PostgreSQL-17-Datenbank anwenden, Bootstrap starten, Pflicht-Passwortwechsel durchführen, Konten mit mehreren Rollen anlegen, Zugriff als Mitglied gegen Superadministration testen, Sessions widerrufen, eigene Daten exportieren, mobile Ansicht/PWA prüfen sowie Backup wiederherstellen. Linting, Typprüfung, Unit- und Integrationstests und Build müssen bestehen. Native Migrationsausführung und Serverbereitstellung müssen in der Zielumgebung geprüft werden.

## Phase 2 – Mitglieder und Dienste

Mitglieder, Mannschaften und Mehrfachzuordnungen, Verantwortliche, Dienstarten, Schichten, freiwillige Anmeldung, Zuordnung und Kapazitäts-/Zeitkonfliktprüfung. Diensttausch ausschließlich transaktional nach Zustimmung. Verfügbarkeiten, Wiederholungen, geleistete Stunden und Berechtigungsprüfungen für die eigene Mannschaft. Tests für parallele Anmeldungen, Konflikte und Tauschzustände.

## Phase 3 – Lager und Einkauf

Artikel-/Lieferantenverwaltung, Lagerorte, unveränderbare Bestandsbewegungen, Mindestbestände, Reservierungen, Inventur und Teillieferungen. Bestände aus dem Ledger statt frei editierbarer Zahl. Transaktionale Bestell-/Wareneingangsabläufe und Nebenläufigkeitstests.

## Phase 4 – Checklisten, Aufgaben und Schäden

Vorlagen, historisierte Ausführungen mit Titel-/Pflichtfeld-Snapshots, Aufgabenzuordnung, Kommentare und gesicherte Anhänge. Vor Dateiuploads MIME-/Größen-/Dateisignaturprüfung, privater Speicher und autorisierter Abruf implementieren. Uploads sind in Phase 1 bewusst nicht öffentlich erreichbar.

## Phase 5 – Veranstaltungen

Spieltage mit Personal-, Checklisten-, Artikel- und Budgetplanung, Reservierungen, Einkaufsbedarf und Nachbereitung.

## Phase 6 – Theke und Finanzen

Touch-Verkauf, idempotente Abschlüsse, transaktionale Lagerabbuchung und Gegenbuchung bei Storno, Zahlarten, Schicht-/Tagesabschlüsse und interne Auswertungen. Rechtskonformen Kasseneinsatz separat prüfen; keine entsprechende Zusage durch diese Software.

## Phase 7 – Erweiterungen

In-App-Mitteilungen aus Geschäftsvorgängen, Präferenzen, Push-/E-Mail-Erweiterung, Berichte, Zeitraumfilter, Exporte, Barcode-/Kamerafunktionen und PWA-Ausbau. Externe Versanddienste optional und austauschbar halten.

Jede Phase wird zuerst vollständig mit echten Abläufen und Berechtigungs-/Nebenläufigkeitstests abgenommen. Erst dann folgt die nächste. Keine bezahlten Ressourcen ohne ausdrücklichen Auftrag.
