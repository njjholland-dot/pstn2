# Who Has This Number? (Distributed Database)

How PSTN2 finds the provider behind any phone number without a central database,
following SPECIFICATION.md §9 Number Discovery. 12 scenes, ~6.5 minutes, narrated.

1. One question behind every call
2. The central database answer (~£2m to build, ~£600k a year to run)
3. The data already exists (Ofcom, Range Holders, every CP)
4. One new field on Ofcom's lists (Range Holder URL)
5. Step 1 · Check the cache
6. Step 2 · Find the Range Holder (longest-prefix match in the S1–S9 list)
7. Step 3 · Ask the Range Holder (unported: `held`)
8. Step 4 · Follow the redirect (ported: `redirect` → `held`)
9. Step 5 · Cache the answer, go direct
10. When the answer changes (`not_held` + `cache.invalidate`)
11. Resilient and secure by design
12. Summary, with links to the test harness and the live test CP

Built on the shared player (`../../shared/README.md`). Edit `narration.json` and
re-render the audio with `node tools/narrate/build-narration.mjs distributed-database`.
