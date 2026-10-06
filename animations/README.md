# PSTN2 presentations

Eleven narrated presentations explaining PSTN2. They are built for television and for large conference screens, and they run on a shared broadcast player (`shared/`).

| # | Presentation | Series | Scenes | Running time |
|---|---|---|---|---|
| 1 | [The Problem](https://pstn2.org/src/problem-statement/) | Core presentation | 8 | 3.8 min |
| 2 | [Solution Overview](https://pstn2.org/src/solution-overview/) | Core presentation | 10 | 5.4 min |
| 3 | [Authentication: Direct Query](https://pstn2.org/src/authentication-option1/) | Technical deep dive | 10 | 4.5 min |
| 4 | [Authentication: Token Pool](https://pstn2.org/src/authentication-option2/) | Technical deep dive | 11 | 4.1 min |
| 5 | [Direct Routing](https://pstn2.org/src/direct-routing/) | Technical deep dive | 12 | 4.5 min |
| 6 | [Emergency Services](https://pstn2.org/src/emergency-services/) | Use case | 9 | 3.6 min |
| 7 | [Who Has This Number?](https://pstn2.org/src/distributed-database/) | Distributed Database | 12 | 6.6 min |
| 8 | [Test Harness: Who Has This Number?](https://pstn2.org/src/test-harness/) | Live demo | 8 | 4.7 min |
| 9 | [MAP Architecture](https://pstn2.org/src/map-architecture/) | Deployment model | 11 | 4.0 min |
| 10 | [End-to-End Scenario](https://pstn2.org/src/end-to-end-scenario/) | Use case | 15 | 6.0 min |
| 11 | [Law Enforcement Access](https://pstn2.org/src/law-enforcement/) | Use case | 8 | 4.6 min |

**Total: 114 scenes, about 52 minutes.**

## Watching and presenting

- Open any presentation, then press **Play**. The narration plays and the scene advances by itself.
- **Keys:** `Space` play/pause · `←` `→` scenes · `1`–`9` jump · `F` full screen · `C` captions · `M` mute.
- **URL options:**
  - `#4` starts at scene 4;
  - `?autoplay=1` plays straight away (after a click, because of browser autoplay rules);
  - `?kiosk=1` loops forever with the controls hidden, for exhibition stands.
- The 1920×1080 stage scales to any screen, letterboxed, so slides look the same on a laptop, a projector or a TV.
- Fonts, D3 and icons are self-hosted, so once a page has loaded it needs no internet connection.

## Narration

Narration is pre-rendered UK English speech, normalised to −16 LUFS. The audio for each deck is in `src/<deck>/audio/`. If the audio cannot play, the player falls back to the browser's own UK voice, then to timed captions.

To change a line, edit `src/<deck>/narration.json`, then run:

```bash
node tools/narrate/build-narration.mjs <deck>                 # only changed lines are re-rendered
PSTN2_VOICE="Jamie (Premium)" node tools/narrate/build-narration.mjs --force   # re-voice everything
```

The best installed en-GB voice is chosen automatically (Premium, then Enhanced, then Daniel). To add Premium voices, go to System Settings › Accessibility › Spoken Content › System voice › Manage Voices.

## Authoring

See [shared/README.md](https://github.com/njjholland-dot/pstn2/blob/main/animations/shared/README.md) for:
- the deck format;
- the scene API;
- broadcast standards (the fictional cast, Ofcom drama-range numbers, and protocol accuracy);
- the capture-mode QA procedure.

## Scenes

### 1. The Problem
1. A network people no longer trust
2. The fraud problem
3. The innovation problem
4. The regulatory gap
5. The central database dilemma
6. Missing capabilities and policies
7. A new strategy
8. Introducing PSTN2

### 2. Solution Overview
1. The core insight
2. A distributed architecture
3. Six capabilities, one network
4. Optional participation
5. No central database required
6. How it works
7. One new field on Ofcom’s lists
8. Security by design
9. Managed Access Providers
10. Join the movement

### 3. Authentication: Direct Query
1. Caller ID can be faked
2. Just ask the caller’s provider
3. The query, step by step
4. When the caller ID has been ported
5. Faster than the first ring
6. Spoofed calls are caught
7. A definitive answer, not a confidence level
8. Secured at every layer
9. One endpoint to build
10. Restoring trust in the phone

### 4. Authentication: Token Pool
1. A second way to verify
2. Creating a token
3. Checking the token
4. Governing a shared pool
5. Built for volume
6. No single pool to fail
7. Security model
8. Simpler for small providers
9. Both options, side by side
10. The trade-offs
11. Open to every provider

### 5. Direct Routing
1. The transit problem
2. Connect directly
3. Finding the other provider
4. Lower cost
5. Lower latency
6. Exchanging encryption keys
7. A secure media path
8. Quality of service
9. Network effects
10. Fallback to today’s network
11. Peering made simple
12. Geographic optimisation

### 6. Emergency Services
1. Every second counts
2. Today: a daily batch file
3. Too vague to act on
4. PSTN2: location in real time
5. Inside the location query
6. Mobile: every location source
7. Fixed lines: better records
8. Minutes saved, lives saved
9. Where regulation is heading

### 7. Who Has This Number?
1. One question behind every call
2. The central database answer
3. The data already exists
4. One new field on Ofcom’s lists
5. Step 1 · Check the cache
6. Step 2 · Find the Range Holder
7. Step 3 · Ask the Range Holder
8. Step 4 · Follow the redirect
9. Step 5 · Cache the answer, go direct
10. When the answer changes
11. Resilient and secure by design
12. Who has this number? Ask.

### 8. Test Harness: Who Has This Number?
1. Meet the test network
2. Every provider keeps a copy of Ofcom’s list
3. Scenario A · An unported number
4. Scenario B · A ported number
5. Scenario C · The next call goes direct
6. Scenario D · The number moves again
7. When there is no PSTN2 answer
8. Your turn

### 9. MAP Architecture
1. The small provider challenge
2. Managed Access Providers
3. What a MAP provides
4. Ways to connect
5. A competitive market
6. What it costs
7. The provider stays in control
8. Regulatory oversight
9. Network effects
10. A rural provider
11. PSTN2 for everyone

### 10. End-to-End Scenario
1. Meet Alice and Bob
2. Alice dials
3. Who has Bob’s number?
4. Is it really Alice?
5. Agreeing encryption
6. A direct media path
7. Who’s calling, verified
8. Bob answers
9. HD voice
10. If Alice dials 999
11. Next time: straight to Bravo
12. Today’s PSTN and PSTN2
13. The cost of a call
14. It just works
15. Everything, working together

### 11. Law Enforcement Access
1. The core insight
2. How it works
3. Authorised parties use the same steps
4. A lookup page for investigators
5. The data already held
6. Validating lawful requests
7. One new field on Ofcom’s lists
8. Learn more
