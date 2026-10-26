# 小智离线适配
基于 upstream dsh-attachment-formats 0.12.4，来源版本见 upstream.json。
强制 builtin PDF.js + 本地 Tesseract OCR，不解析云 OCR 凭据、不调用外部解析服务。
语言包和 WASM 随离线发行包携带；缺失即报错，不联网补下载。
不启用可选 PyMuPDF 引擎。本分支的受支持离线后端以 lib/ 中实现为准；src/ 只同步了选择器，重新构建后必须重跑离线策略检查。
