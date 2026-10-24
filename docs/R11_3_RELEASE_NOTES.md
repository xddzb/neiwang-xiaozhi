# 内网小智 R11.3 · 麒麟 ARM64

本版增加定时任务、技能孵化器和离线 PDF/中英文 OCR，并将首页文案改为“你说我做，随时待命”。

- **定时任务**：启用 DSH 原生可选模块，提供自动化任务页、会话工具及持久化。Host关闭时停止调度，重启后按规则补投递；投递与业务成功分开判断。
- **技能孵化器**：本地流程预览、技能草稿生成、格式校验、打包和描述改进；限制技能文件操作范围，防止同名覆盖和路径越界，重启后可发现已保存技能。
- **PDF解析大师**：PDF.js文字层解析、本地Tesseract中英文扫描件OCR、附件入口和pdf_parse工具；语言包/WASM随包携带，不联网补下载，不启用云OCR。
- 保留内网模型、Dify RAG、钉钉机器人及AI表格原有能力；组织配置通过独立内网包交付。

## 安装

下载配套的 Core 核心包与 Plugins 插件包，在同一个新的可写目录解压：

```sh
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.3-Public-Core.tar.gz
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.3-Public-Plugins.tar.gz
cd Neiwang-Xiaozhi-Kylin-ARM64-R11.3
sh plugin-pack/安装插件.sh
sh 配置模型.sh
sh start.sh
```

需要知识库时执行 `sh 配置RAG.sh`。GitHub 公开安装包不包含组织凭据或内部接口资料。

两包配套使用，不要分别解压到不同文件夹。详见 [分包安装说明](R11_3_SPLIT_INSTALL.md)。分包逐文件比对通过，合并内容与原完整包一致；报告见 `*-split-validation.json`。

## 验证与限制

验收结果见随附 validation.json 和交接文档。测试使用 ARM64 Ubuntu 20.04/QEMU及本地模拟模型，不能替代实际麒麟V10和组织接口验收。PDF/OCR离线测试在禁网命名空间中执行，真实钉钉消息及表格写入不在本次测试范围。

扫描件OCR每次最多20页，复杂表格、公式和低质量扫描须核对原页。技能格式校验不代表业务质量合格。APP需保持运行才能按时调度，不安装系统常驻服务。

[开发交接与构建说明](R11_3_HANDOVER.md)
