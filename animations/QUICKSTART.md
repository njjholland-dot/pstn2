# PSTN2 presentations: quick start

## Watch online
Go to https://pstn2.org and pick a presentation. Then press **Play**.

## Watch offline or present at an event
```bash
git clone https://github.com/njjholland-dot/pstn2.git
cd pstn2
python3 -m http.server 8000 --directory animations
```
Then open http://localhost:8000/.

- Press **F** for full screen.
- Hide the cursor by keeping the mouse still: the controls fade after a few seconds of playback.
- For a stand or a lobby screen, add `?kiosk=1` to loop a deck forever.

## Controls

| Key | Action |
|---|---|
| Space or K | Play / pause |
| → / PageDown | Next scene |
| ← / PageUp | Previous scene |
| 1–9 | Jump to scene |
| Home / End | First / last scene |
| F | Full screen |
| C | Captions on/off |
| M | Mute |

Click the list icon in the control bar to jump to any scene by name.

## Recommended order

1. The Problem
2. Solution Overview
3. Who Has This Number? (Distributed Database)
4. Test Harness: Live Demo (ends with an interactive mode you can drive live on stage)
5. The technical deep dives and use cases, as your audience needs them

## Before a big screen

- Check the sound on the venue system with the first scene.
- Captions are on by default. For a large hall, leave them on.
- Use Chrome, Edge or Safari, with hardware acceleration enabled.
