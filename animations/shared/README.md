# PSTN2 presentation player

Every PSTN2 presentation runs on this shared, broadcast-grade player. It provides:

- a fixed **1920 × 1080 stage**, scaled to fit any screen, so a deck looks identical on a laptop, a projector or a television;
- **pre-rendered UK narration**, which drives the timeline: visual cues fire on narration segment boundaries;
- captions, chapters, full screen, keyboard control, deep links and a kiosk loop.

Reference implementations: `../src/distributed-database/` (standard layout) and
`../src/test-harness/` (wide layout plus an interactive scene).

## A deck is five files

```
animations/src/<deck>/
  index.html       copy from ../distributed-database/index.html; change <title> and description only
  narration.json   the script: scenes → segments (captions show this text; the voice reads it)
  scenes.js        createDeck({ scenes: { <sceneId>: { build(s), cues: { <segmentId>: fn } } } })
  deck.css         deck-specific styles (optional)
  audio/           generated: node tools/narrate/build-narration.mjs <deck>
```

### narration.json

```json
{
  "deck": "direct-routing",
  "title": "Direct Routing",
  "titleHtml": "Direct <span>routing</span>",
  "kicker": "Technical deep dive",
  "subtitle": "One sentence shown on the title card.",
  "endNote": "One sentence on the end card.",
  "scenes": [
    { "id": "intro", "title": "On-screen scene title",
      "segments": [
        { "id": "a", "text": "One or two sentences. Captions show exactly this." },
        { "id": "b", "text": "Dial 0161 496 0123.", "say": "optional spoken override" }
      ] }
  ]
}
```

- **Segment length:** 1–2 sentences, so each one is a cue point and fits a two-line caption: at most 200 characters. Over 165 characters the caption font steps down; keep most segments under 165.
- **Pronunciation:** handled by `lexicon.js` (PSTN2, CP, Ofcom S1–S9, £2m, phone numbers digit by digit). Use `say` only for exceptions.
- **Optional `pauseAfter`:** seconds of silence after a segment. The default is 0.45.
- **Optional `"layout": "wide"`:** a compact header that gives a 1728 × 742 content area instead of 1728 × 670.

### scenes.js

```js
import { createDeck } from '../../shared/pstn2-player.js';
createDeck({ scenes: {
  intro: {
    build(s) { s.box = s.card({ x: 0, y: 40, w: 520, title: 'Alpha Telecom', iconName: 'building-2', colour: 'blue' }); },
    cues: {
      a: (s) => s.reveal(s.box),
      'b+1.5': async (s) => { const c = s.connect(s.box, s.other); await c.done; await s.packet(c, { label: 'GET' }); },
    },
  },
} });
```

- **`build(s)`** creates the scene's starting state. Elements created with `hidden: true` (the default for most components) wait for `s.reveal()`.
- **Cues** are keyed by segment id. `'<id>+<seconds>'` fires that many seconds after the segment starts. Cues may be `async`.
- **Timing:** always use `s.wait(ms)` and `s.t(ms)`. They become instant in capture mode and shorter with reduced motion. Never call `setTimeout` directly.
- **Coordinates** are content pixels. The origin is the top-left of a 1728 × 670 box (1728 × 742 in wide layout). Keep everything inside it: the header and captions sit outside it.

## Scene API (`s`): see pstn2-components.js

| Call | Use |
|---|---|
| `s.card({x,y,w,h,title,sub,iconName,colour,body,compact})` | Entity box: CP, Ofcom, database, phone |
| `s.table(card, {columns:[{key,label,num}], colour})` → `.add(row,{flash,cls})`, `.highlight(i,colour)`, `.remove(i)` | Data in a card |
| `s.bullets({x,y,w,items:[{icon,text,sub,colour}],gap})` → `.items` (reveal individually) | Lists |
| `s.stat({x,y,w,value,label,colour})` + `s.countUp(el,to,{format})` | Big numbers |
| `s.statement({x,y,w,html,size})` (`<em>` = brand gradient), `s.lead({...})` | Headlines and body copy |
| `s.pill({x,y,text,iconName,colour})`, `s.tag(text,colour)` | Badges |
| `s.msg({x,y,w,title,json\|text,colour,iconName,expand})` | Protocol message bubble (real JSON) |
| `s.steps({x,y,w,items})` → `.set(i)`, `.done()` | Numbered process rail |
| `s.connect(a,b,{from,to,colour,dashed,bend,label,fromOpts:{dx,dy}})` → `{done, fade()}` | Arrows between elements or `{x,y}` points |
| `s.packet(conn,{colour,label,duration,reverse})` | Message dot travelling along a connector |
| `s.reveal(el\|[els],{delay,from})`, `s.hide(el)`, `s.dim(el,on)`, `s.activate(el,on)`, `s.ring(el)`, `s.type(el,text)` | Motion and emphasis |
| `s.el(html,{x,y,w,h,cls,colour,hidden,from})`, `s.icon(name,{size})` | Anything else |

Colours: `blue green amber red violet cyan pink gold slate white`.
Icons: Lucide names listed in `icons.js` (`iconNames`).

**Never use emoji.** They render differently on every operating system and look amateur on a big screen.

## Broadcast standards (checked in QA)

1. **Readable from the back of a hall:**
   - body text ≥ 24px; labels ≥ 16px;
   - one idea per scene;
   - at most about 6 visual elements competing at once.
2. **Nothing overlaps, nothing is clipped.** Everything stays inside the content box and stays clear of the caption bar.
3. **Motion follows the voice.** Each element appears when it is mentioned, never all at once.
4. **Consistency:** the same CP names, colours and fictional numbers from Ofcom's reserved TV/drama ranges:
   - Alpha Telecom 020 7946 0xxx (blue)
   - Bravo Networks 0161 496 0xxx (green)
   - Charlie Comms 0113 496 0xxx (amber)
   - 07700 900xxx (mobile)

   Never show real-looking numbers or real company names (other than Ofcom).
5. **Protocol accuracy:** number discovery is always the cache → Ofcom S1–S9 list + Range Holder URL → Range Holder → redirect if ported → cache, with `cache.invalidate` (SPECIFICATION.md §9).
   - There is no directory service and no eventual-consistency replication.
   - The central-database comparison is **~£2m to build and ~£600k a year to run (30%)**.

## QA

```bash
node tools/narrate/build-narration.mjs <deck>                     # render audio (idempotent)
python3 -m http.server 47910 --bind 127.0.0.1 --directory animations
# open http://127.0.0.1:47910/src/<deck>/index.html?capture=1
#   window.__p2.show(i)       → build scene i and run all its cues instantly
#   window.__p2.show(i, k)    → run cues up to segment k
```

Take a 1920 × 1080 screenshot of every scene in capture mode and look at each one. Then play at least one scene normally to confirm the audio and cue sync.

**Other URL options:** `#5` starts at scene 5. `?autoplay=1`. `?kiosk=1` loops forever with the chrome hidden, for exhibition stands.

**Keys:** Space play/pause · ← → scenes · 1–9 jump · F full screen · C captions · M mute.
