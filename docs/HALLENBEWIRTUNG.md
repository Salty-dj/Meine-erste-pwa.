# Hallenbewirtung

Die Hallenbewirtung verwendet dieselben Konten, Mitglieder und Mannschaften wie die übrige Dienstplanung. Vereins- und Superadministratoren vergeben oder entziehen die zusätzliche Rolle unter **Hallenbewirtung**. Mannschaftszuordnung und Kontoverknüpfung stammen aus **Mitglieder & Teams**.

## Einzeltermin und Saison

- Ein Termin beginnt als Entwurf. Zeiten werden als deutsche Ortszeit eingegeben. Ein Ende nach Mitternacht benötigt das Folgedatum.
- Die Saisonplanung verwendet bestätigte Spielplanzeilen. Bei fehlender Endzeit werden 90 Minuten angenommen. CSV und XLSX brauchen erkennbare Überschriften. PDF wird aus der Textebene gelesen. Bei uneindeutigen oder gescannten Plänen ist die CSV-Vorlage der verlässliche Importweg. Ein URL-Import ist derzeit nicht eingerichtet.
- Spielnummern werden pro Mannschaft und Saison erkannt. Ohne Spielnummer dienen Startzeit und beide Mannschaften als Wiedererkennungsmerkmale. Bereits importierte Spiele werden beim erneuten Import übersprungen.
- Mannschaften übernehmen Schichten als Gruppe. Namentliche Besetzung und die Aufgaben Einkauf, Aufmachen und Zumachen werden separat eingetragen. Eine organisierte Mannschaftsschicht kann daher noch unter Sollstärke liegen.
- Verbindliche Regeln sperren Kandidaten. Wunschregeln fließen zusammen mit der bisherigen Dienstzeit, Soll-Zahl und Folgeschichten in die deterministische Auswahl ein. Die Planung bevorzugt Schichten mit wenigen verfügbaren Mannschaften. Sie kann offene Schichten hinterlassen und beweist kein mathematisches Optimum.
- Vor der Veröffentlichung können Entwürfe bearbeitet und Schichten gesperrt werden. Die Neuplanung füllt ausschließlich offene, ungesperrte Entwurfsschichten. Mitglieder sehen die ihnen oder ihrer Mannschaft zugeordneten Schichten und die eigenen Aufgaben nach Veröffentlichung. **Drucken / als PDF speichern** verwendet den PDF-Druck des Browsers.

## Regeltexte und optionale OpenAI-Anbindung

Die integrierte deutsche Regelerkennung läuft kostenlos auf dem Server. Sie erkennt ausdrücklich unterstützte Muster und zeigt nicht erkannte Zeilen an. Vorschläge lassen sich vor der Planung prüfen, bearbeiten, als verbindlich kennzeichnen oder entfernen.

Für einen späteren OpenAI-Adapter ist `RuleProposalProvider` in `src/lib/hall/rule-text.ts` vorgesehen. Der Adapter erhält nur den eingegebenen Regeltext und die verfügbaren Mannschaftsbezeichnungen und -IDs. Er muss strukturierte Regelvorschläge gemäß `rulesSchema` liefern. Modellantworten und Mannschaftsreferenzen werden serverseitig validiert. Der Adapter schreibt keine Daten und hat keine Kontrolle über den Planer. Bei einem Fehler bleibt die lokale Erkennung verfügbar.

Der OpenAI-Adapter ist nicht aktiviert. Nach einer gesonderten Freigabe kann ein serverseitiger Adapter mit einem Render-Secret ergänzt werden. Vor dem Einschalten sind Kostenlimit, Timeout und die Freigabe für die Übermittlung von Regeltexten festzulegen.
