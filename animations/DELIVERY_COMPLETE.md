# PSTN2 presentations: delivery report (v1.1, 6 October 2026)

## Delivered

- **Presentations:** 10 narrated presentations, 103 scenes, about 45 minutes, on one shared broadcast player. They include the rebuilt **Who Has This Number? (Distributed Database)** and the new **Test Harness: Live Demo**.
- **Narration:** pre-rendered UK English, loudness-normalised (−16 LUFS), with captions and a live-speech fallback.
- **Visual standard:**
  - a 1920×1080 stage;
  - self-hosted Inter typeface;
  - Lucide icons and no emoji;
  - one consistent fictional cast and Ofcom drama-range numbers.
- **Protocol accuracy:** every deck uses the v1.1 Number Discovery mechanism (SPECIFICATION.md §9). The central-database comparison is ~£2m to build and ~£600k a year to run.
- **Test harness:**
  - Ofcom's numbering list and three CPs (Range Holders with ported numbers), each with a number database and a cache;
  - narrated scenarios for unported, ported, cached, invalidated, not-in-service and non-participating numbers;
  - an interactive mode running the reference discovery engine.

## Per presentation

| # | Presentation | Scenes | Running time |
|---|---|---|---|
| 1 | The Problem | 8 | 3.6 min |
| 2 | Solution Overview | 10 | 5.1 min |
| 3 | Caller Authentication | 10 | 4.3 min |
| 4 | Direct Routing | 12 | 4.3 min |
| 5 | Emergency Services | 9 | 3.4 min |
| 6 | Who Has This Number? | 12 | 6.3 min |
| 7 | Test Harness: Who Has This Number? | 8 | 4.5 min |
| 8 | MAP Architecture | 11 | 3.9 min |
| 9 | End-to-End Scenario | 15 | 5.7 min |
| 10 | Law Enforcement Access | 8 | 4.3 min |

## Quality checks performed
- Capture-mode screenshots of every scene at 1920×1080, each reviewed by eye.
- An automated check that elements stay inside the content box.
- Zero console errors.
- Normal playback verified for caption and cue sync.
- Loudness measured on rendered audio.

## Narration voice
All narration is rendered with the **Siri British English voice C** (`com.apple.siri.natural.en-GB-C`), set as the macOS System Voice and rendered with `PSTN2_VOICE=system node tools/narrate/build-narration.mjs --force`. Loudness was measured at −16.5 to −16.7 LUFS.
