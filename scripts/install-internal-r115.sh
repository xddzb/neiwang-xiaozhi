#!/bin/sh
set -eu
if [ "$#" -gt 1 ]; then
  echo '内网预配置版不需要旧APP路径。用法：sh 合并安装R11.5.sh 新安装目录'
  exit 1
fi
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEST=${1:-"$HERE/合并后的R11.5"}
if [ -e "$DEST" ]; then
  echo '目标目录已存在，请选择新的可写目录。'
  exit 1
fi
mkdir -p -- "$DEST"
DEST=$(CDPATH= cd -- "$DEST" && pwd)
tar -xzf "$HERE/Neiwang-Xiaozhi-Kylin-ARM64-R11.5-Internal-Core.tar.gz" -C "$DEST"
tar -xzf "$HERE/Neiwang-Xiaozhi-Kylin-ARM64-R11.5-Internal-Plugins.tar.gz" -C "$DEST"
APP="$DEST/Neiwang-Xiaozhi-Kylin-ARM64-R11.5"
sh "$APP/plugin-pack/安装插件.sh"
printf '%s\n' '安装完成，模型、RAG和接口资料已内置，无需迁移或首次配置。启动命令：' "sh \"$APP/start.sh\""
