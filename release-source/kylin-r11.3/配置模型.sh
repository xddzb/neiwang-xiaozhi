#!/bin/sh
set -eu
APP=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export PYTHONHOME="$APP/runtime/python"
export LD_LIBRARY_PATH="$APP/runtime/python/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$APP/runtime/python/bin/python3" "$APP/tools/setup_model.py"
