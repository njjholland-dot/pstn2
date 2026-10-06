# Direct Routing

How PSTN2 connects providers peer to peer: number discovery finds the destination’s provider, a signed routing request returns the address for a direct SIP INVITE, and DTLS-SRTP encrypts the media (SPECIFICATION.md §6, §7, §9).

Runs on the shared PSTN2 broadcast player (`../../shared/`, see its README).
12 scenes, about 4.5 minutes of pre-rendered UK narration.

## Files

- `narration.json` — the script (captions and voice)
- `scenes.js` — the animated diagrams, cued to the narration
- `deck.css` — deck-specific styles
- `audio/` — generated: `node tools/narrate/build-narration.mjs direct-routing`

## Scenes

1. The transit problem (19 s)
2. Connect directly (19 s)
3. Finding the other provider (45 s)
4. Lower cost (19 s)
5. Lower latency (17 s)
6. Exchanging encryption keys (28 s)
7. A secure media path (23 s)
8. Quality of service (18 s)
9. Network effects (19 s)
10. Fallback to today’s network (21 s)
11. Peering made simple (20 s)
12. Geographic optimisation (19 s)

View: `index.html` (add `?capture=1` for QA, `#3` to start at scene 3).
