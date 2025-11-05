#!/usr/bin/env bash
set -euo pipefail

# Run from the script directory (project root)
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f manifest.json ]]; then
    echo "manifest.json not found in $(pwd)"
    exit 1
fi

# Try to read version from manifest.json (fallback to 0.0.0)
version=$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"(.*)".*/\1/' || true)
version=${version:-0.0.0}

# Use first arg as name or fallback to directory name
name=${1:-$(basename "$(pwd)")}
# sanitize name for filename
name=$(echo "$name" | tr ' ' '-' | tr -cd 'A-Za-z0-9_.-')

outfile="${name}-v${version}.zip"

rm -f "$outfile"
echo "Creating $outfile..."

# Files and folders to include in the distribution
zip -r "$outfile" \
    manifest.json \
    background.js \
    options.html \
    options.js \
    options.css \
    icons \
    lib

echo "Done: $outfile"