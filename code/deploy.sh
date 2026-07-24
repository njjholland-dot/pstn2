#!/bin/bash

# FTP Configuration
FTP_HOST="11a71a0.netsolhost.com"
FTP_USER="ftp4768717"
FTP_PASS="${PSTN2_FTP_PASSWORD:?Set PSTN2_FTP_PASSWORD in your environment}"
FTP_ROOT="/htdocs"

echo "=========================================="
echo "Deploying PSTN2 Code Samples & Documentation"
echo "=========================================="
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

# =============================================================================
# MAIN DOCUMENTATION
# =============================================================================
echo ""
echo "=== Uploading Main Documentation ==="
upload_file "EXAMPLES.md" "$FTP_ROOT/docs/EXAMPLES.md"
echo ""

# =============================================================================
# TYPESCRIPT
# =============================================================================
echo "=== Uploading TypeScript Code Samples ==="
echo ""

# TypeScript examples
for example in typescript/examples/*.ts; do
    filename=$(basename "$example")
    upload_file "$example" "$FTP_ROOT/code/typescript/examples/$filename"
done

# TypeScript README
upload_file "typescript/README.md" "$FTP_ROOT/code/typescript/README.md"

# TypeScript package.json
if [ -f "typescript/package.json" ]; then
    upload_file "typescript/package.json" "$FTP_ROOT/code/typescript/package.json"
fi

# TypeScript tsconfig.json
if [ -f "typescript/tsconfig.json" ]; then
    upload_file "typescript/tsconfig.json" "$FTP_ROOT/code/typescript/tsconfig.json"
fi

echo ""

# =============================================================================
# PYTHON
# =============================================================================
echo "=== Uploading Python Code Samples ==="
echo ""

# Python examples
for example in python/examples/*.py; do
    filename=$(basename "$example")
    upload_file "$example" "$FTP_ROOT/code/python/examples/$filename"
done

# Python README
upload_file "python/README.md" "$FTP_ROOT/code/python/README.md"

echo ""

# =============================================================================
# GO
# =============================================================================
echo "=== Uploading Go Code Samples ==="
echo ""

# Go examples
for example in go/examples/*.go; do
    filename=$(basename "$example")
    upload_file "$example" "$FTP_ROOT/code/go/examples/$filename"
done

# Go README
upload_file "go/README.md" "$FTP_ROOT/code/go/README.md"

# Go mod file
if [ -f "go/go.mod" ]; then
    upload_file "go/go.mod" "$FTP_ROOT/code/go/go.mod"
fi

echo ""

# =============================================================================
# SPECIFICATIONS
# =============================================================================
echo "=== Uploading Specifications ==="
echo ""

cd "$BASE_DIR/../docs" || exit 1

if [ -f "SPECIFICATION.md" ]; then
    upload_file "SPECIFICATION.md" "$FTP_ROOT/docs/SPECIFICATION.md"
fi

if [ -f "API-SPECIFICATION.yaml" ]; then
    upload_file "API-SPECIFICATION.yaml" "$FTP_ROOT/docs/API-SPECIFICATION.yaml"
fi

if [ -f "IMPLEMENTATION-GUIDE.md" ]; then
    upload_file "IMPLEMENTATION-GUIDE.md" "$FTP_ROOT/docs/IMPLEMENTATION-GUIDE.md"
fi

if [ -f "TESTING-SPECIFICATION.md" ]; then
    upload_file "TESTING-SPECIFICATION.md" "$FTP_ROOT/docs/TESTING-SPECIFICATION.md"
fi

echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Deployed Files:"
echo "  - Main Documentation (EXAMPLES.md)"
echo "  - TypeScript: 5 examples + README"
echo "  - Python: 5 examples + README"
echo "  - Go: 5 examples + README"
echo "  - Specifications: 4 documents"
echo ""
echo "URLs:"
echo "  - Examples:       https://pstn2.org/docs/EXAMPLES.md"
echo "  - TypeScript:     https://pstn2.org/code/typescript/"
echo "  - Python:         https://pstn2.org/code/python/"
echo "  - Go:             https://pstn2.org/code/go/"
echo "  - Specification:  https://pstn2.org/docs/SPECIFICATION.md"
echo "  - API Spec:       https://pstn2.org/docs/API-SPECIFICATION.yaml"
echo "=========================================="
