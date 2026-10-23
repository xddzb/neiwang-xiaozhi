#!/bin/sh
set -eu
APP=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DESKTOP=$(xdg-user-dir DESKTOP 2>/dev/null || printf '%s/Desktop' "$HOME")
mkdir -p "$DESKTOP"
ESC=$(printf '%s' "$APP" | sed 's/\\/\\\\/g; s/"/\\"/g; s/%/%%/g')
printf '[Desktop Entry]\nType=Application\nName=内网小智\nExec=bash "%s/start.sh"\nIcon=%s/launcher/shell/assets/cgn-egret.png\nTerminal=false\nCategories=Office;\n' "$ESC" "$APP" > "$DESKTOP/内网小智.desktop"
chmod +x "$DESKTOP/内网小智.desktop"
