# Authentication: Token Pool

How providers verify calls with 30-second tokens: the originating provider creates a token (`POST /pstn2/v1/auth/tokens`), its ID travels in the SIP INVITE, and the receiving provider checks it with one `GET` (SPECIFICATION.md §5.2).

Runs on the shared PSTN2 broadcast player (`../../shared/`, see its README).
11 scenes, about 4.1 minutes of pre-rendered UK narration.

## Files

- `narration.json` — the script (captions and voice)
- `scenes.js` — the animated diagrams, cued to the narration
- `deck.css` — deck-specific styles
- `audio/` — generated: `node tools/narrate/build-narration.mjs authentication-option2`

## Scenes

1. A second way to verify (22 s)
2. Creating a token (29 s)
3. Checking the token (29 s)
4. Governing a shared pool (22 s)
5. Built for volume (25 s)
6. No single pool to fail (18 s)
7. Security model (21 s)
8. Simpler for small providers (19 s)
9. Both options, side by side (24 s)
10. The trade-offs (18 s)
11. Open to every provider (19 s)

View: `index.html` (add `?capture=1` for QA, `#3` to start at scene 3).
