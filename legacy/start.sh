#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ ! -f "$ROOT/var/active-runtime" ]; then
    echo '尚未启用私有环境，请先运行 offline_runtime.py install / activate。' >&2
    exit 1
fi
IFS= read -r RELEASE < "$ROOT/var/active-runtime"
case "$RELEASE" in
    ''|.*|*[!a-zA-Z0-9_.-]*) echo '无效的环境标识' >&2; exit 1 ;;
esac
PYTHON="$ROOT/env/$RELEASE/bin/python3"
if [ ! -x "$PYTHON" ] || [ ! -f "$ROOT/env/$RELEASE/ready.json" ]; then
    echo '私有环境不完整，拒绝回退到系统 Python。' >&2
    exit 1
fi
unset PYTHONHOME PYTHONPATH LD_PRELOAD LD_LIBRARY_PATH
export PYTHONNOUSERSITE=1
cd "$ROOT"
# 第一阶段仅提供标准库闭环探测；不自动进入依赖尚未锁定的 LangChain 引擎。
exec "$PYTHON" -I -B "$ROOT/scripts/probe_tool_roundtrip.py" "$@"
