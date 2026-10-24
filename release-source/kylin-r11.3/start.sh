#!/bin/sh
set -eu
APP=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
[ "$(uname -m)" = aarch64 ] || { echo '本包仅适用于麒麟 ARM64/aarch64'; exit 1; }
mkdir -p "$APP/data"
export NEIWANG_APP_ROOT="$APP"
exec 9>"$APP/data/start.lock"
flock -n 9 || { echo '内网小智已在运行'; exit 1; }
exec "$APP/runtime/node/bin/node" "$APP/launcher/supervisor.cjs"
