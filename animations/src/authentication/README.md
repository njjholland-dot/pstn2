# Caller Authentication

How a receiving provider verifies a caller ID in real time by asking the caller’s own provider (`POST /pstn2/v1/auth/verify`), found through PSTN2 number discovery (SPECIFICATION.md §5.1, §9).

Runs on the shared PSTN2 broadcast player (`../../shared/`, see its README).
10 scenes, about 4.5 minutes of pre-rendered UK narration.

## Files

- `narration.json` — the script (captions and voice)
- `scenes.js` — the animated diagrams, cued to the narration
- `deck.css` — deck-specific styles
- `audio/` — generated: `node tools/narrate/build-narration.mjs authentication`

## Scenes

1. Caller ID can be faked (21 s)
2. Just ask the caller’s provider (25 s)
3. The query, step by step (33 s)
4. When the caller ID has been ported (43 s)
5. Faster than the first ring (17 s)
6. Spoofed calls are caught (30 s)
7. A definitive answer, not a confidence level (35 s)
8. Secured at every layer (29 s)
9. One endpoint to build (23 s)
10. Restoring trust in the phone (17 s)

View: `index.html` (add `?capture=1` for QA, `#3` to start at scene 3).
