# Solution Overview

Core presentation, 10 scenes, about 5.4 minutes. Runs on the shared broadcast player
(`../../shared/`); see `../../shared/README.md` for controls, QA and rendering.

| # | Scene | Shows |
|---|---|---|
| 1 | The core insight | Each CP already holds its own numbering data; the central database is crossed out |
| 2 | A distributed architecture | A mesh of providers asking each other directly |
| 3 | Six capabilities, one network | Authentication, direct routing, encryption, branding, emergency location, open messaging |
| 4 | Optional participation | Adoption at each CP's own pace; non-participants fall back to today's network |
| 5 | No central database required | ~£2m build and ~£600k a year (30%) versus no central cost |
| 6 | How it works | Number discovery: cache → Ofcom S1–S9 list → Range Holder → redirect → cache, go direct |
| 7 | One new field on Ofcom's lists | The Range Holder URL field, cached copies, mirrors, the risk if the regulator declines |
| 8 | Security by design | Zero trust (Ed25519), TLS 1.3 and per-call SRTP, data minimisation |
| 9 | Managed Access Providers | MAPs host the API, number discovery, security and a portal for smaller CPs |
| 10 | Join the movement | pstn2.org: code, specification, presentations |

Scenes 1, 6 and 7 live in `core-scenes.js` (styles in `core.css`) and are shared with the
Law Enforcement deck, so both stay identical. Audio: `node tools/narrate/build-narration.mjs solution-overview`.
