#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f manifest-firefox.json ]]; then
    echo "manifest-firefox.json not found in $(pwd)"
    exit 1
fi

if [[ ! -f manifest-chrome.json ]]; then
    echo "manifest-chrome.json not found in $(pwd)"
    exit 1
fi

# Parse arguments
NO_ZIP=false
if [[ "${1:-}" == "--no-zip" ]]; then
    NO_ZIP=true
    shift
fi

version=$(grep -m1 '"version"' manifest-firefox.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"(.*)".*/\1/' || true)
version=${version:-0.0.0}

name=${1:-$(basename "$(pwd)")}
name=$(echo "$name" | tr ' ' '-' | tr -cd 'A-Za-z0-9_.-')

# Create dist directory
mkdir -p dist

# List of files to copy
FILES=(
    "background.js"
    "options.html"
    "options.js"
    "options.css"
    "icons"
    "lib"
    "default-config.json"
)

# Build Firefox version
echo "Building Firefox version..."
firefox_dir="dist/firefox"
rm -rf "$firefox_dir"
mkdir -p "$firefox_dir"

# Copy files
for file in "${FILES[@]}"; do
    cp -r "$file" "$firefox_dir/"
done

# Copy Firefox manifest
cp manifest-firefox.json "$firefox_dir/manifest.json"

# Create Firefox zip
if [[ "$NO_ZIP" == false ]]; then
    firefox_outfile="dist/${name}-firefox-v${version}.zip"
    rm -f "$firefox_outfile"
    echo "Creating Firefox zip: $firefox_outfile..."
    cd "$firefox_dir"
    zip -r "../../$firefox_outfile" ./*
    cd ../..
fi

# Build Chrome version
echo "Building Chrome version..."
chrome_dir="dist/chrome"
rm -rf "$chrome_dir"
mkdir -p "$chrome_dir"

# Copy files
for file in "${FILES[@]}"; do
    cp -r "$file" "$chrome_dir/"
done

# Copy Chrome manifest
cp manifest-chrome.json "$chrome_dir/manifest.json"

# Create Chrome zip
if [[ "$NO_ZIP" == false ]]; then
    chrome_outfile="dist/${name}-chrome-v${version}.zip"
    rm -f "$chrome_outfile"
    echo "Creating Chrome zip: $chrome_outfile..."
    cd "$chrome_dir"
    zip -r "../../$chrome_outfile" ./*
    cd ../..
fi

echo "Done!"
echo "Unpacked distributions:"
echo "  Firefox: $firefox_dir"
echo "  Chrome:  $chrome_dir"
echo ""
if [[ "$NO_ZIP" == false ]]; then
    echo "Zip files:"
    echo "  Firefox: $firefox_outfile"
    echo "  Chrome:  $chrome_outfile"
fi