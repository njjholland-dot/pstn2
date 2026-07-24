#!/bin/bash

# FTP Configuration
FTP_HOST="11a71a0.netsolhost.com"
FTP_USER="ftp4768717"
FTP_PASS="${PSTN2_FTP_PASSWORD:?Set PSTN2_FTP_PASSWORD in your environment}"
FTP_ROOT="/htdocs"

echo "Starting deployment to pstn2.org..."
echo "FTP Host: $FTP_HOST"
echo "FTP Root: $FTP_ROOT"
echo ""

# Base directory
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$BASE_DIR" || exit 1

# Function to upload a file
upload_file() {
    local_file="$1"
    remote_path="$2"

    echo "Uploading: $local_file -> $remote_path"

    curl -s -T "$local_file" \
        --user "$FTP_USER:$FTP_PASS" \
        "ftp://$FTP_HOST$remote_path" \
        --ftp-create-dirs

    if [ $? -eq 0 ]; then
        echo "  ✓ Success"
    else
        echo "  ✗ Failed"
        return 1
    fi
}

# Upload main index.html
echo "=== Uploading main index ==="
upload_file "index.html" "$FTP_ROOT/index.html"
echo ""

# Upload each animation directory
for dir in src/*/; do
    dir_name=$(basename "$dir")
    echo "=== Uploading $dir_name ==="

    # Upload HTML file
    if [ -f "${dir}index.html" ]; then
        upload_file "${dir}index.html" "$FTP_ROOT/src/$dir_name/index.html"
    fi

    # Upload JS file
    if [ -f "${dir}animation.js" ]; then
        upload_file "${dir}animation.js" "$FTP_ROOT/src/$dir_name/animation.js"
    fi

    # Upload CSS file
    if [ -f "${dir}styles.css" ]; then
        upload_file "${dir}styles.css" "$FTP_ROOT/src/$dir_name/styles.css"
    fi

    echo ""
done

echo "==================================="
echo "Deployment complete!"
echo "Your site should now be live at: https://pstn2.org"
echo "==================================="
