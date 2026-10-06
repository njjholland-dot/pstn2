#!/bin/bash
#
# deploy.sh — deploy the PSTN2 website to production (https://pstn2.org)
#
# Stages the repo into the deployed-site layout, then mirrors it to the
# web host over SFTP. Only uploads files that are newer than what is on
# the server; never deletes anything remotely, so the other content that
# shares the host (Properties/, 8x8comms/, forum/, log/) is untouched.
#
# Usage:
#   export PSTN2_FTP_PASSWORD='<SFTP password>'   # see local credentials vault, §10 SFTP
#   ./deploy.sh              # deploy changed files
#   ./deploy.sh --dry-run    # show what would be uploaded, upload nothing
#   ./deploy.sh --full       # re-upload every site file regardless of timestamps
#   ./deploy.sh --stage-only # build the site into .deploy-stage/ and stop (no credentials needed)
#
# Requires: lftp (brew install lftp)
#
# Repo -> site mapping (same as the original per-directory deploy scripts):
#   animations/index.html                     -> /index.html
#   animations/src/                           -> /src/
#   animations/{README,QUICKSTART,
#     DELIVERY_COMPLETE,TESTING_CHECKLIST}.*  -> /animations/
#   animations/shared/                        -> /shared/   (presentation player)
#   code/                                     -> /code/
#   docs/                                     -> /docs/
#   testcp/                                   -> /testcp/   (live dummy test CP)
#   Claude.md, DOWNLOAD-README.md             -> /
#   git archive of HEAD                       -> /pstn2-complete.zip, /pstn2-test-harness.zip

set -euo pipefail

SFTP_HOST="11a71a0.netsolhost.com"
SFTP_USER="ftp4768717"
SFTP_ROOT="/htdocs"
SITE_URL="https://pstn2.org"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGE_DIR="$REPO_DIR/.deploy-stage"

DRY_RUN=""
STAGE_ONLY=""
ONLY_NEWER="--only-newer"
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN="--dry-run" ;;
        --full)    ONLY_NEWER="" ;;
        --stage-only) STAGE_ONLY=1 ;;
        *) echo "Unknown option: $arg"; echo "Usage: $0 [--dry-run] [--full] [--stage-only]"; exit 1 ;;
    esac
done

command -v lftp >/dev/null 2>&1 || { echo "ERROR: lftp not found (brew install lftp)"; exit 1; }
[ -n "$STAGE_ONLY" ] || : "${PSTN2_FTP_PASSWORD:?Set PSTN2_FTP_PASSWORD in your environment (SFTP password for $SFTP_USER@$SFTP_HOST)}"

echo "=============================================="
echo " PSTN2 deploy -> $SITE_URL"
[ -n "$DRY_RUN" ] && echo " (DRY RUN - nothing will be uploaded)"
echo "=============================================="

# --- 1. Stage the repo into the deployed-site layout ------------------------
# cp -p preserves mtimes so --only-newer uploads just the files you edited.
echo ""
echo "Staging site into $STAGE_DIR ..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/src" "$STAGE_DIR/animations" "$STAGE_DIR/code" "$STAGE_DIR/docs" "$STAGE_DIR/shared" "$STAGE_DIR/testcp"

cp -p  "$REPO_DIR/animations/index.html" "$STAGE_DIR/index.html"
cp -Rp "$REPO_DIR/animations/src/."      "$STAGE_DIR/src/"
cp -Rp "$REPO_DIR/animations/shared/."   "$STAGE_DIR/shared/"
cp -Rp "$REPO_DIR/testcp/."              "$STAGE_DIR/testcp/"
for f in README QUICKSTART DELIVERY_COMPLETE TESTING_CHECKLIST; do
    cp -p "$REPO_DIR/animations/$f".* "$STAGE_DIR/animations/" 2>/dev/null || true
done
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.venv' --exclude='*.egg-info' \
      --exclude='__pycache__' --exclude='.pytest_cache' "$REPO_DIR/code/" "$STAGE_DIR/code/"
cp -Rp "$REPO_DIR/docs/." "$STAGE_DIR/docs/"
cp -p  "$REPO_DIR/Claude.md" "$REPO_DIR/DOWNLOAD-README.md" "$STAGE_DIR/"
cp -p  "$REPO_DIR/animations/favicon."* "$STAGE_DIR/" 2>/dev/null || true
[ -f "$REPO_DIR/animations/changes.html" ] && cp -p "$REPO_DIR/animations/changes.html" "$STAGE_DIR/changes.html"

# Downloads: built from the committed tree (git archive never includes ignored
# files such as tools/testcp/.keys.json). Cached per commit so an unchanged zip
# keeps its timestamp and is not re-uploaded.
HEAD_SHA="$(git -C "$REPO_DIR" rev-parse --short=12 HEAD)"
ZIP_CACHE="$REPO_DIR/.deploy-cache/$HEAD_SHA"
if [ ! -f "$ZIP_CACHE/pstn2-complete.zip" ]; then
    rm -rf "$REPO_DIR/.deploy-cache"; mkdir -p "$ZIP_CACHE"
    git -C "$REPO_DIR" archive --format=zip --prefix=pstn2/ -o "$ZIP_CACHE/pstn2-complete.zip" HEAD
    git -C "$REPO_DIR" archive --format=zip --prefix=pstn2-test-harness/ -o "$ZIP_CACHE/pstn2-test-harness.zip" HEAD \
        test-environment animations/src/test-harness animations/shared testcp tools/testcp code docs/SPECIFICATION.md docs/API-SPECIFICATION.yaml LICENSE
fi
cp -p "$ZIP_CACHE/pstn2-complete.zip" "$ZIP_CACHE/pstn2-test-harness.zip" "$STAGE_DIR/"
if ! git -C "$REPO_DIR" diff --quiet HEAD -- animations code docs testcp test-environment; then
    echo "WARNING: uncommitted changes — the zips are built from HEAD ($HEAD_SHA), the site from the working tree."
fi

# Never publish deploy tooling, secrets or local junk
rm -f "$STAGE_DIR/code/deploy.sh"
find "$STAGE_DIR" \( -name '.DS_Store' -o -name '.keys.json' -o -name '.env' \) -delete

echo "Staged $(find "$STAGE_DIR" -type f | wc -l | tr -d ' ') files ($(du -sh "$STAGE_DIR" | cut -f1))."
if [ -n "$STAGE_ONLY" ]; then echo "Stage only: $STAGE_DIR (not uploaded)."; exit 0; fi

# --- 2. Mirror to the server -------------------------------------------------
echo ""
echo "Uploading to sftp://$SFTP_USER@$SFTP_HOST$SFTP_ROOT ..."
export LFTP_PASSWORD="$PSTN2_FTP_PASSWORD"
lftp -u "$SFTP_USER" --env-password "sftp://$SFTP_HOST" -e "
set sftp:auto-confirm yes;
set mirror:parallel-transfer-count 4;
mirror -R --no-perms $ONLY_NEWER $DRY_RUN --verbose $STAGE_DIR $SFTP_ROOT;
exit
"

# --- 3. Verify ---------------------------------------------------------------
if [ -z "$DRY_RUN" ]; then
    echo ""
    echo "Verifying site ..."
    # The host's firewall rejects curl's default user agent, so identify ourselves.
    UA="pstn2-deploy-check/1.1"
    for path in / /docs/SPECIFICATION.html /code/typescript/README.md \
                /src/distributed-database/index.html /src/test-harness/index.html /shared/pstn2-player.js \
                /testcp/ /testcp/numbering-list.json /testcp/a/pstn2/v1/numbers/447700900003 \
                /pstn2-complete.zip /pstn2-test-harness.zip; do
        res=$(curl -s -A "$UA" -o /dev/null -w "%{http_code} %{content_type}" "$SITE_URL$path")
        echo "  $SITE_URL$path -> HTTP $res"
    done
fi

rm -rf "$STAGE_DIR"
echo ""
echo "Done."
