# PSTN2 presentations: QA checklist

Run this before publishing any change to a presentation.

## Automated
- [ ] `node tools/narrate/build-narration.mjs <deck>` succeeds. Every scene has audio, and `audio/manifest.json` is current.
- [ ] `node --test test-environment/conformance/engine.test.mjs` passes. This includes a check that the harness fixtures have not drifted.
- [ ] Loudness: `ffmpeg -i src/<deck>/audio/<scene>.mp3 -af ebur128 -f null -` measures within ±1 LU of −16 LUFS.

## Capture mode (every scene)
Open `src/<deck>/index.html?capture=1` at 1920×1080. For each scene `i`, run `await window.__p2.show(i)` and take a screenshot.

- [ ] Nothing overlaps; nothing is clipped; everything stays inside the content area and clear of the caption bar.
- [ ] Text: at least 24px for body text and 16px for labels; nothing truncated mid-word.
- [ ] Connectors start and end on the right elements, and arrowheads are visible.
- [ ] No emoji. Icons come from the Lucide set.
- [ ] Only fictional providers (Alpha, Bravo and Charlie Comms, Delta Voice) and Ofcom drama-range numbers.
- [ ] The browser console shows zero errors.

## Normal playback (at least one scene per deck)
- [ ] Play starts the narration. Captions follow the voice, and each visual change appears as it is mentioned.
- [ ] Pause and resume, Next and Previous, chapter jumps, captions toggle, mute and full screen all work.
- [ ] The deck advances by itself and ends on the end card, with "Up next" pointing to the right presentation.

## Content accuracy
- [ ] Number discovery is always: cache → Ofcom S1–S9 list + Range Holder URL → Range Holder → redirect if ported → cache, with `cache.invalidate`.
- [ ] Never mention a directory service, replication or eventual consistency.
- [ ] Central database comparison: ~£2m to build and ~£600k a year to run.

## Screens
- [ ] Desktop 1920×1080 and 1280×720 (letterboxed, sharp).
- [ ] Phone, 390px wide: the stage scales and the controls stay usable.
