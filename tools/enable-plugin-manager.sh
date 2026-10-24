#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then echo '用法：sh 启用插件管理.sh /完整路径/旧版R11.3目录'; exit 1; fi
KIT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP=$(CDPATH= cd -- "$1" && pwd)
exec "$APP/runtime/node/bin/node" "$KIT/setup-plugin-manager.cjs" "$APP"
