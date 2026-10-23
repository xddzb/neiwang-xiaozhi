#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP=
for candidate in "$PWD" "$HERE/.."; do
  if [ -f "$candidate/config/app.json" ] && [ -f "$candidate/tools/rag_tool.py" ]; then
    APP=$(CDPATH= cd -- "$candidate" && pwd)
    break
  fi
done
if [ -z "$APP" ]; then
  echo 'Extract rag-restore inside the APP directory, then run again from the APP directory.'
  exit 2
fi
SEED="$HERE/dify.enc"
EXPECTED=$(tr -d '\r\n' < "$HERE/dify.enc.sha256")
ACTUAL=$(sha256sum "$SEED")
ACTUAL=${ACTUAL%% *}
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo 'RAG seed checksum mismatch; nothing changed.'
  exit 2
fi
mkdir -p "$APP/config/defaults" "$APP/data/config"
if [ ! -f "$APP/config/defaults/dify.enc" ]; then
  (umask 077; cp "$SEED" "$APP/config/defaults/dify.enc")
  chmod 600 "$APP/config/defaults/dify.enc"
else
  echo 'Existing default Dify configuration preserved.'
fi
if [ ! -f "$APP/data/config/dify.enc" ]; then
  (umask 077; cp "$APP/config/defaults/dify.enc" "$APP/data/config/dify.enc")
  chmod 600 "$APP/data/config/dify.enc"
else
  echo 'Existing active Dify configuration preserved.'
fi
export PYTHONHOME="$APP/runtime/python"
export LD_LIBRARY_PATH="$APP/runtime/python/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export NEIWANG_RAG_CONFIG="$APP/data/config/dify.enc"
"$APP/runtime/python/bin/python3.11" "$APP/tools/rag_tool.py" status
echo 'Local RAG configuration check completed. No knowledge query or network request was made.'
echo 'Restart Xiaozhi, enable RAG in the lower-left corner, and start a new chat.'
