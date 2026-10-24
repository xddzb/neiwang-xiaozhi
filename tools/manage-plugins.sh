#!/bin/sh
set -eu
APP=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$#" -lt 1 ]; then
  echo '用法：sh 管理插件.sh check|install 插件包目录 [--adopt-existing]'
  echo '      sh 管理插件.sh list|rollback|recover'
  exit 1
fi
COMMAND=$1
shift
case "$COMMAND" in
  check|install)
    if [ "$#" -lt 1 ]; then echo '请提供已解压的离线插件包目录'; exit 1; fi
    PACKAGE=$1
    shift
    exec "$APP/runtime/node/bin/node" "$APP/tools/offline-plugin-manager.cjs" "$COMMAND" --app "$APP" --package "$PACKAGE" "$@"
    ;;
  list|rollback|recover)
    exec "$APP/runtime/node/bin/node" "$APP/tools/offline-plugin-manager.cjs" "$COMMAND" --app "$APP" "$@"
    ;;
  *) echo '未知命令'; exit 1 ;;
esac
