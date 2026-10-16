#!/usr/bin/env sh
# Installs the `ion` command from this folder (macOS and Linux).
# Usage:  sh scripts/install.sh

set -eu
cd "$(dirname "$0")/.."

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ion install: '$1' was not found. $2" >&2
    exit 1
  fi
}

need node "Install Node.js 20 or newer from https://nodejs.org"
need npm "npm comes with Node.js; reinstall Node.js from https://nodejs.org"

major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 20 ]; then
  echo "ion install: Node.js $major is too old. Ion needs Node.js 20 or newer." >&2
  exit 1
fi

echo "Installing packages..."
npm install
echo "Building..."
npm run build
echo "Making the 'ion' command available everywhere..."
npm link

echo ""
echo "Done. Open a new terminal and run: ion --version"
