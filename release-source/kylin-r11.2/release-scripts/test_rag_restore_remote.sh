#!/bin/sh
set -eu
BASE=/home/tester/Neiwang-Xiaozhi-Kylin-ARM64-R10
TEST=/home/tester/rag-restore-regression
mkdir -p "$TEST/config" "$TEST/data/config"
ln -s "$BASE/tools" "$TEST/tools"
ln -s "$BASE/runtime" "$TEST/runtime"
printf '%s\n' '{"version":"R11.2-rag-fixture"}' > "$TEST/config/app.json"
printf '%s\n' 'model-sentinel-unchanged' > "$TEST/data/config/model.enc"
tar -xzf /home/tester/rag-restore-hotfix.tar.gz -C "$TEST"
cd "$TEST"
sh -n rag-restore/恢复RAG配置.sh
sh rag-restore/恢复RAG配置.sh
cmp rag-restore/dify.enc data/config/dify.enc
cmp rag-restore/dify.enc config/defaults/dify.enc
FIRST=$(sha256sum data/config/dify.enc)
sh rag-restore/恢复RAG配置.sh
SECOND=$(sha256sum data/config/dify.enc)
test "$FIRST" = "$SECOND"
grep -q model-sentinel-unchanged data/config/model.enc
echo 'PASS ARM64 RAG seed restore, configured status, idempotence, model preservation; no network query'
