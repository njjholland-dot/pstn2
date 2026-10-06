# The Problem

Core presentation, 8 scenes, about 3.8 minutes. Runs on the shared broadcast player
(`../../shared/`); see `../../shared/README.md` for controls, QA and rendering.

| # | Scene | Shows |
|---|---|---|
| 1 | A network people no longer trust | PSTN and CPs at risk, $38bn estimated fraud losses, unanswered calls |
| 2 | The fraud problem | Fraudster spoofs "Your Bank" on 020 7946 0999; money flows from the victim; trust drains |
| 3 | The innovation problem | Illustrative innovation bars; gains went to social networks and OTT, not telecoms |
| 4 | The regulatory gap | Technology versus regulation chart, the gap, the AI spike |
| 5 | The central database dilemma | ~£2m to build, ~£600k a year to run (30%); not progressed; One-Touch Switch was mandated |
| 6 | Missing capabilities and policies | Six missing capabilities; policy shift from switching to innovation |
| 7 | A new strategy | "What if there were another way?" and the five "withouts" |
| 8 | Introducing PSTN2 | Free libraries and documentation; privacy and security between participants |

Files: `narration.json` (script and captions), `scenes.js` (diagrams and cues), `deck.css`,
`audio/` (generated with `node tools/narrate/build-narration.mjs problem-statement`).
