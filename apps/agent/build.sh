#!/bin/bash
# BitTrail Agent - Build Script pentru Linux x86_64
# Ruleaza: ./build.sh

set -e

VERSION="1.0.0"
BINARY_NAME="bittrail-agent"
BUILD_DIR="build"

echo "╔══════════════════════════════════════════════════╗"
echo "║     BitTrail Agent - Build pentru Linux x86_64   ║"
echo "╚══════════════════════════════════════════════════╝"
echo

# Creeaza build directory
mkdir -p "$BUILD_DIR"

# Build pentru Linux x86_64
echo "Building $BINARY_NAME v$VERSION pentru linux/amd64..."

GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build \
    -ldflags="-s -w" \
    -o "$BUILD_DIR/$BINARY_NAME" \
    ./cmd/agent

echo
echo "✓ Build complet!"
echo
echo "Output: $BUILD_DIR/$BINARY_NAME"
echo "Size: $(ls -lh "$BUILD_DIR/$BINARY_NAME" | awk '{print $5}')"
echo
echo "Pentru a instala pe server Linux:"
echo "  scp $BUILD_DIR/$BINARY_NAME user@server:/tmp/"
echo "  ssh user@server 'sudo mv /tmp/$BINARY_NAME /usr/local/bin/ && sudo chmod +x /usr/local/bin/$BINARY_NAME'"
echo
