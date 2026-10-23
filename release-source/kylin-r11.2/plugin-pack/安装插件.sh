#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec ./runtime/node/bin/node ./plugin-pack/install.cjs
