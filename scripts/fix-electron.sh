#!/bin/bash

# Ultimate simple fix for Electron - works with any version
echo "🔧 Fixing Electron..."

# Find the electron directory (works with any version)
ELECTRON_DIR=$(find node_modules/.pnpm -maxdepth 2 -name "electron@*" -type d 2>/dev/null | head -1)

if [ -n "$ELECTRON_DIR" ]; then
    ELECTRON_DIR="$ELECTRON_DIR/node_modules/electron"
elif [ -d node_modules/electron ]; then
    ELECTRON_DIR="node_modules/electron"
fi

if [ -n "$ELECTRON_DIR" ]; then
    cd "$ELECTRON_DIR"
    rm -rf dist path.txt
    npm run postinstall

    case "$(uname -s)" in
        Darwin*) ELECTRON_PATH="Electron.app/Contents/MacOS/Electron" ;;
        MINGW*|MSYS*|CYGWIN*) ELECTRON_PATH="electron.exe" ;;
        *) ELECTRON_PATH="electron" ;;
    esac

    if [ ! -f path.txt ] && [ -f "dist/$ELECTRON_PATH" ]; then
        printf '%s' "$ELECTRON_PATH" > path.txt
    fi

    if [ "$(uname -s)" = "Darwin" ] && [ ! -e "dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework" ] && command -v unzip >/dev/null 2>&1; then
        VERSION=$(node -p "require('./package.json').version")
        PLATFORM=$(node -p "process.platform")
        ARCH=$(node -p "process.arch")
        ZIP=$(find "$HOME/Library/Caches/electron" "$HOME/.cache/electron" -name "electron-v$VERSION-$PLATFORM-$ARCH.zip" 2>/dev/null | head -1)
        if [ -n "$ZIP" ]; then
            rm -rf dist
            mkdir -p dist
            unzip -q "$ZIP" -d dist
            printf '%s' "$ELECTRON_PATH" > path.txt
        fi
    fi

    if [ -f path.txt ] && [ -f "dist/$(cat path.txt)" ] && { [ "$(uname -s)" != "Darwin" ] || [ -e "dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework" ]; }; then
        echo "✅ Electron fixed! Run: pnpm dev:desktop"
    else
        echo "❌ Electron binary is still incomplete. Try: rm -rf node_modules && pnpm install"
        exit 1
    fi
else
    echo "❌ Electron not found. Running pnpm install..."
    pnpm install
fi
