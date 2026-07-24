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
#
# Requires: lftp (brew install lftp)
#
# Repo -> site mapping (same as the original per-directory deploy scripts):
#   animations/index.html                     -> /index.html
#   animations/src/                           -> /src/
#   animations/{README,QUICKSTART,
#     DELIVERY_COMPLETE,TESTING_CHECKLIST}.*  -> /animations/
#   code/                                     -> /code/
#   docs/                                     -> /docs/
#   Claude.md, DOWNLOAD-README.md             -> /

set -euo pipefail

SFTP_HOST="11a71a0.netsolhost.com"
SFTP_USER="ftp4768717"
SFTP_ROOT="/htdocs"
SITE_URL="https://pstn2.org"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGE_DIR="$REPO_DIR/.deploy-stage"

DRY_RUN=""
ONLY_NEWER="--only-newer"
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN="--dry-run" ;;
        --full)    ONLY_NEWER="" ;;
        *) echo "Unknown option: $arg"; echo "Usage: $0 [--dry-run] [--full]"; exit 1 ;;
    esac
done

command -v lftp >/dev/null 2>&1 || { echo "ERROR: lftp not found (brew install lftp)"; exit 1; }
: "${PSTN2_FTP_PASSWORD:?Set PSTN2_FTP_PASSWORD in your environment (SFTP password for $SFTP_USER@$SFTP_HOST)}"

echo "=============================================="
echo " PSTN2 deploy -> $SITE_URL"
[ -n "$DRY_RUN" ] && echo " (DRY RUN - nothing will be uploaded)"
echo "=============================================="

# --- 1. Stage the repo into the deployed-site layout ------------------------
# cp -p preserves mtimes so --only-newer uploads just the files you edited.
echo ""
echo "Staging site into $STAGE_DIR ..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/src" "$STAGE_DIR/animations" "$STAGE_DIR/code" "$STAGE_DIR/docs"

cp -p  "$REPO_DIR/animations/index.html" "$STAGE_DIR/index.html"
cp -Rp "$REPO_DIR/animations/src/."      "$STAGE_DIR/src/"
for f in README QUICKSTART DELIVERY_COMPLETE TESTING_CHECKLIST; do
    cp -p "$REPO_DIR/animations/$f".* "$STAGE_DIR/animations/" 2>/dev/null || true
done
rsync -a --exclude='node_modules' --exclude='dist' "$REPO_DIR/code/" "$STAGE_DIR/code/"
cp -Rp "$REPO_DIR/docs/." "$STAGE_DIR/docs/"
cp -p  "$REPO_DIR/Claude.md" "$REPO_DIR/DOWNLOAD-README.md" "$STAGE_DIR/"
cp -p  "$REPO_DIR/animations/favicon."* "$STAGE_DIR/" 2>/dev/null || true
[ -f "$REPO_DIR/animations/changes.html" ] && cp -p "$REPO_DIR/animations/changes.html" "$STAGE_DIR/changes.html"

# Never publish deploy tooling or local junk
rm -f "$STAGE_DIR/code/deploy.sh"
find "$STAGE_DIR" -name '.DS_Store' -delete

echo "Staged $(find "$STAGE_DIR" -type f | wc -l | tr -d ' ') files."

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
    for path in / /docs/SPECIFICATION.html /code/typescript/README.md; do
        code=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL$path")
        echo "  $SITE_URL$path -> HTTP $code"
    done
fi

rm -rf "$STAGE_DIR"
echo ""
echo "Done."
