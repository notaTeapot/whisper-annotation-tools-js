# Whisper Annotation Converter (Web Version)

Eine moderne, browserbasierte Webanwendung, um Whisper-Transkripte (JSON) in das `.flk`-Format oder in ein Sketch Engine kompatibles XML-Format umzuwandeln. Die gesamte Verarbeitung findet sicher und lokal in deinem Browser (Client-Side) statt – es werden keine Daten an einen Server gesendet.

🤖 **Hinweis zur Entstehung:** 
Dieses Projekt wurde größtenteils mit KI-Unterstützung erstellt. Es funktioniert analog zum originalen Python-basierten [whisper-annotation-tools](https://github.com/notaTeapot/whisper-annotation-tools/) Repository und portiert dessen Kernfunktionen in eine leichtgewichtige, serverlose Weboberfläche.

## Features

- **Lokale Verarbeitung:** Lade deine `.json` oder `.flk` Transkripte per Drag & Drop hoch.
- **Interaktiver Metadaten-Editor:** Füge Metadaten (wie Titel, Datum, etc.) über ein einfaches Key-Value-Feld oder direkt als rohes JSON hinzu. Die Metadaten werden live validiert.
- **FLK-Export:** Kombiniere Metadaten und Transkript-Daten in einer sauberen `.flk` Datei.
- **Sketch Engine XML-Export:** Generiere direkt XML-Dateien mit `<doc>`, `<u>` (Utterance) und `<w>` (Word) Tags inklusive Timestamps und Confidence-Scores, optimiert für den Import in die Sketch Engine.
- **Syntax-Highlighting:** Code-Blöcke und der Live-Editor sind mit Prism.js gestyled.

## Nutzung

Da es sich um eine reine Frontend-Anwendung handelt, gibt es zwei einfache Wege, das Tool zu nutzen:

1. **Lokal:** Lade das Repository herunter und öffne die `index.html` einfach in einem modernen Webbrowser.
2. **GitHub Pages:** Lade die Dateien in dein GitHub-Repository hoch und aktiviere GitHub Pages (unter *Settings > Pages*), um das Tool direkt online über eine URL zugänglich zu machen.

---

## Impressum / Legal Notice

Angaben gemäß § 5 TMG:

**Vasco Alexander Sahlbach**  
Prager Str 1 D  
01069 Dresden  
Deutschland  

**Kontakt:**  
E-Mail: couldbeateapot@gmail.com  
