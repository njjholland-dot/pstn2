# PSTN2 deployment summary

**Site:** https://pstn2.org (NetworkSolutions static hosting, SFTP, shared host under `/htdocs`)
**Script:** `./deploy.sh` at the repository root (lftp mirror, upload newer files only, never deletes)
**Current release:** protocol v1.1, 2026-10-06

## What is deployed where

| Repository | Site |
|---|---|
| `animations/index.html`, `changes.html`, favicons | `/` |
| `animations/src/<deck>/` (11 presentations including `test-harness/`) | `/src/<deck>/` |
| `animations/shared/` (player, fonts, D3, icons) | `/shared/` |
| `animations/{README,QUICKSTART,DELIVERY_COMPLETE,TESTING_CHECKLIST}.*` | `/animations/` |
| `code/` (minus node_modules, dist, .venv, caches) | `/code/` |
| `docs/` | `/docs/` |
| `testcp/` (static dummy test CP) | `/testcp/` |
| `git archive HEAD` | `/pstn2-complete.zip`, `/pstn2-test-harness.zip` |

## Procedure

```bash
test-environment/conformance/run.sh       # must be green
git commit …                              # zips are built from HEAD
./deploy.sh --stage-only                  # optional: inspect .deploy-stage/
export PSTN2_FTP_PASSWORD='…'             # from the local credentials vault
./deploy.sh --dry-run && ./deploy.sh
test-environment/conformance/run.sh --live
```

The script ends by checking key URLs: the homepage, the specification, the Distributed Database deck, the harness, the player, the test CP numbering list, a ported test number, and both zips. It sends a non-default User-Agent, because the host's firewall returns 403 to `curl/*` and `Go-http-client/*`.

## Static-host notes

- The test CP's discovery answers are extensionless files. `.htaccess` sets `ForceType application/json` and CORS. If the host ignores `.htaccess`, the SDKs still parse the JSON whatever the Content-Type.
- Unknown test numbers fall through to the host's HTML 404 page. That is compliant: in Number Discovery a 404 body is optional.
- Rebuilding `testcp/` with the same signing keys needs `tools/testcp/.keys.json`. The file is gitignored; a copy is in the local credentials vault, §14.
