# Law Enforcement Access

Use case, 8 scenes, about 4.6 minutes. Runs on the shared broadcast player
(`../../shared/`); see `../../shared/README.md` for controls, QA and rendering.

| # | Scene | Shows |
|---|---|---|
| 1 | The core insight | Shared with Solution Overview |
| 2 | How it works | Shared with Solution Overview: the number discovery steps |
| 3 | Authorised parties use the same steps | No cache; Ofcom list → Range Holder → redirect → current holder |
| 4 | A lookup page for investigators | A JavaScript page (from pstn2.org or a local copy) finds who holds 0113 496 0456 |
| 5 | The data already held | Customer, billing and calling-history records stay with the CP; released only for lawful requests |
| 6 | Validating lawful requests | Certificates, SPOC, access tokens; hybrid recommended; issuing authorities still to be identified |
| 7 | One new field on Ofcom's lists | Shared with Solution Overview, plus non-participating ranges cannot be queried |
| 8 | Learn more | pstn2.org and the other presentations |

Scenes 1, 2 and 7 import `../solution-overview/core-scenes.js`; `deck.css` imports
`../solution-overview/core.css`. Audio: `node tools/narrate/build-narration.mjs law-enforcement`.
