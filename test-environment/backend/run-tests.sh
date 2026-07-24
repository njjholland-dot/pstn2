#!/bin/bash

echo "======================================================================"
echo "PSTN2 Test Harness - Integration Test Suite"
echo "======================================================================"
echo ""

cd "$(dirname "$0")"

# Compile TypeScript test file
echo "Compiling tests..."
npx ts-node tests/integration.test.ts
