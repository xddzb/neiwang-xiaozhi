#!/bin/sh
set -eu
APP=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export NEIWANG_APP_ROOT="$APP"
exec "$APP/runtime/node/bin/node" "$APP/tools/dws-login.cjs"
