# Betrieb, Datenschutz und Wiederherstellung

## Verantwortlichkeit

Der Vereinsbetreiber bestimmt Datenschutzverantwortliche, Zugangsvergabe und Löschfristen, dokumentiert den Verarbeitungszweck und informiert Mitglieder. Dies ist technische Unterstützung für einen DSGVO-orientierten Betrieb, keine Zertifizierung. Vor Verwendung echter Mitgliederdaten sind die organisatorischen Regeln und der produktive Serverbetrieb zu prüfen.

Es werden in Phase 1 nur Name, E-Mail, Hash des Passworts, Rollen und notwendige Sitzungs-/Auditinformationen benötigt. Es gibt keine öffentliche Registrierung und keine öffentliche Mitgliederliste. Session-Tokens liegen nur als SHA-256-Hash in PostgreSQL; das zufällige Original steht ausschließlich im HttpOnly-Cookie. Sitzungen enden nach acht Stunden; Passwörter werden mit scrypt N=32768, r=8, p=1, individuellem Salt und 64-Byte-Schlüssel gehasht. Authentifizierung und Export sind vom PWA-Cache ausgeschlossen.

## Rollenmodell

| Rolle                       | Aktueller Zugriff                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Superadministrator          | Alle Dashboard-Auswertungen, Benutzerkonten und Rollen                                                |
| Vereinsadministrator        | Vereinsweites Dashboard, Lager-/Finanz-/Team-Auswertungen                                             |
| Mannschaftsverantwortlicher | Persönliches Dashboard; Stunden nur der selbst verantworteten Teams                                   |
| Lagerverantwortlicher       | Persönliches Dashboard und Lagerauswertung                                                            |
| Kassenverantwortlicher      | Persönliches Dashboard und interne Finanzsumme                                                        |
| Mitglied/Helfer             | Eigene Dienste, Aufgaben und Mitteilungen; interne Veranstaltungstermine und freie freiwillige Plätze |

Mehrere Rollen kombinieren Rechte. Das Ausblenden von Links ist nur Bedienhilfe; jede geschützte Server Action prüft Session und Rechte erneut. Änderungen an Rollen/Aktivität beenden alle Sitzungen des Kontos. Die letzte aktive Superadministration darf nicht deaktiviert/demotiert werden. Die spätere Mitgliederverwaltung ist kein automatisch öffentliches Verzeichnis.

## Betrieb und Sicherheit

- `APP_URL` muss exakt der externen Origin entsprechen; Origin-Prüfung und Next.js-Server-Action-Schutz blockieren fremde Formularursprünge. Es gibt kein offenes CORS.
- Produktiv `SESSION_SECURE=true`, HTTPS und sichere Reverse-Proxy-Konfiguration verwenden. HTTP ist nur für localhost-Entwicklung vorgesehen. Datenbank nie öffentlich exponieren.
- `.env` und Backups vor fremden Benutzern schützen. Unterschiedliche Datenbankzugänge für Laufzeit und Migration sind für die gehärtete Produktion empfohlen.
- Keine E-Mail-Adresse oder Passwortwerte bei Anmeldefehlern protokollieren. Fehlversuche werden mit einem Hash des normalisierten Anmeldenamens gespeichert; Antworten unterscheiden nicht zwischen unbekanntem und falschem Konto.
- Bei Passwortverlust muss ein berechtigter Serverbetreiber eine kontrollierte Passwortzurücksetzung durchführen. Es gibt in Phase 1 noch keinen E-Mail-Passwortreset. Kein neues Konto mit bekannten Standarddaten erzeugen und keine Hashes manuell als Klartext überschreiben.
- Uploads sind bis zur Umsetzung der privaten Speicherung und Dateivalidierung nicht freigeschaltet. Die Attachment-Tabelle ist ausschließlich ein Schemafundament.
- Sicherheitsupdates regelmäßig mit separatem Branch und allen Prüfungen durchführen. Die CSP erlaubt Next.js-Inline-Hydration; Benutzereingaben werden als React-Text gerendert, nicht als HTML.

## Sicherung

`docker compose --profile production up -d` startet den Backup-Dienst. Er erstellt nach Verfügbarkeit der DB und anschließend alle 24 Stunden ein PostgreSQL-Custom-Format-Archiv im ignorierten Verzeichnis `backups/`. Die Datei erhält erst nach erfolgreicher Archivprüfung den endgültigen Namen. Lokale Archive älter als 30 Tage werden entfernt; unvollständige `.tmp`-Dateien gelten nicht als Sicherung. Der Dienst stoppt bei Fehlern; Docker startet ihn erneut. Betriebsverantwortliche müssen Fehler überwachen und freien Speicher prüfen.

Eine zweite, verschlüsselte Kopie außerhalb des Servers einrichten und die Wiederherstellung regelmäßig proben. `pg_restore --list` prüft die Archivstruktur, aber ersetzt keinen Restore-Test. Sicherungen enthalten personenbezogene Daten und Passwort-Hashes. Verschlüsselung und gesicherte Aufbewahrung des Schlüssels sind Aufgabe des Betreibers.

Einmalige manuelle Sicherung mit Docker (Bash, in PowerShell 7.4+ ist binäre Umleitung ebenfalls unterstützt; auf älteren PowerShell-Versionen **nicht** für Binärdateien verwenden):

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U tsv -d tsv -Fc > backups/tsv-manuell.dump
docker compose exec -T db pg_restore --list < backups/tsv-manuell.dump
```

Plattformunabhängig mit installierten PostgreSQL-17-Clienttools: **`npm run db:backup`**. Das Skript liest `DATABASE_URL` aus `.env`, entfernt den Prisma-spezifischen `schema`-URL-Parameter für PostgreSQL-Tools, übergibt das Passwort nur per Prozessumgebung und erstellt ein privates Archiv. Kein Backup in `public/` ablegen.

## Wiederherstellung zuerst in eine neue Datenbank

App-Schreibzugriffe stoppen, vorhandene DB sichern, Sicherung und Ziel eindeutig prüfen. Niemals zur Probe die produktive Datenbank überschreiben.

Bash/WSL-Beispiel mit Docker:

```sh
docker compose exec -T db createdb -U tsv tsv_restore_check
docker compose exec -T db pg_restore -U tsv -d tsv_restore_check --no-owner --exit-on-error < backups/tsv-manuell.dump
docker compose exec -T db psql -U tsv -d tsv_restore_check -c 'SELECT count(*) FROM "User";'
```

Zusätzlich Rollenanzahl, Audit-Log und fachliche Stichproben mit der Quelle vergleichen; App mit separater Testkonfiguration gegen die Restore-DB starten. Danach gezielt umschalten: `DATABASE_URL` auf die geprüfte Wiederherstellung setzen, aktuelle Migrationen kontrolliert anwenden, alle alten Sessions über `DELETE FROM "Session";` in der wiederhergestellten DB widerrufen und die App neu starten. Anmeldung, Dashboard und `/api/health` prüfen. Alte Datenbank erst nach Freigabe und Ablauf der Rückfallfrist entfernen. Ein Backup enthält die Prisma-Migrationshistorie, sofern es aus einer regulär mit `prisma migrate deploy` verwalteten Datenbank stammt.

## Aufbewahrung und Löschung

`npm run db:prune` löscht abgelaufene Sitzungen, Anmeldesperren/fehlgeschlagene Logins nach 30 Tagen und übrige Audit-Logs nach 365 Tagen. Den Befehl täglich über Cron/Windows-Aufgabenplanung unter dem Betriebskonto ausführen; Bereinigungen zuerst mit den Vereinsvorgaben abstimmen. Diese Fristen sind technische Ausgangswerte und müssen ggf. an die dokumentierten Vereinsregeln angepasst werden. Das Skript löscht keine Mitgliedschaften, Buchungen oder fachlichen Historien.

Ein deaktiviertes Konto ist nicht gelöscht. Löschanfragen in Phase 1 kontrolliert durch die Administration bearbeiten: Identität prüfen, eigenen Export ermöglichen, Konto deaktivieren und Sessions widerrufen, rechtliche Aufbewahrung prüfen, personenbezogene Angaben soweit zulässig löschen/pseudonymisieren. Ein automatisierter Lösch-Workflow und die selektive Anonymisierung fachlicher Historien werden erst mit den zugehörigen Modulen implementiert. Verbleibende Sicherungen laufen nach der Backup-Frist aus; nach einer Wiederherstellung bereits bearbeitete Löschanfragen erneut anwenden. Keine vollständige datenschutzrechtliche Konformität allein aus dem Vorhandensein dieser Funktionen ableiten.

## Protokolle und Audit

Audit-Einträge enthalten Aktion, Akteur, Objekt-ID und für Rollenänderungen die Rolle/Aktivität, keine Passwörter oder vollständigen Session-Tokens. Der Zugriff auf die DB und Serverlogs ist auf die Betriebsadministration beschränkt. Es gibt in Phase 1 noch keine öffentliche Audit-UI.

## Wechsel von Klar

Die alte lokale Aufgabenverwaltung ist im Git-Verlauf und unter `legacy/klar/` erhalten. Der Schlüssel `klar.tasks.v1` wird von diesem Projekt nicht angefasst. Die neue PostgreSQL-Datenbank übernimmt weder alte Aufgaben noch Gerätedaten automatisch. Alte Daten bei Bedarf vor einem Domainwechsel sichern; ein hostübergreifender Browserzugriff ist technisch nicht möglich.
