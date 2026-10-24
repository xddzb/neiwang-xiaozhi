# 麒麟 ARM64 R11.3 交接

日期：2026-10-24。内核固定为 DeepSeek Harness 0.2.0-rc.2，未修改内核文件。

## 本版变化

- 启用官方可选 `@deepseek-ai/dsh-experimental-schedule-bundle`：时间上下文、定时任务服务、自动化任务页及会话工具。
- 接入 `@neiwang/skill-incubator`：基于 pinned dsh-skill-creator 的离线核心，适配新版工具/技能注册接口；支持预览、生成、校验、打包、改进触发描述。生成的是草稿，不代表完成业务效果评估。
- 接入离线适配的 `dsh-attachment-formats`：PDF.js 文字层解析、Tesseract.js 中英文扫描件 OCR、附件交互和 `pdf_parse` 工具。云 OCR 和外部解析服务被后端策略禁用，语言数据/WASM随包携带，缺失不联网补下载。
- 首页改为“你说我做，随时待命”；保留 RAG、内网模型、钉钉机器人和 AI 表格的原有能力与授权规则。

## 源码位置

| 路径 | 职责 |
| --- | --- |
| `extensions/@neiwang/skill-incubator` | DSH 0.2 适配器、设置页、受控本地技能库、上游来源与 MIT 许可证 |
| `extensions/@neiwang/skill-incubator/upstream-source` | 固定上游 TypeScript，作为可追溯来源 |
| `extensions/dsh-attachment-formats` | Apache-2.0 上游插件及离线修改；`upstream.json` 记录 commit |
| `scripts/compile-incubator.cjs` | 将上游无依赖核心转换为随包 MJS，并强制使用受限技能文件适配器 |
| `scripts/prepare-offline-plugins.cjs` | 在获批联网构建机准备固定依赖和 OCR 数据；APP运行时不执行 |
| `scripts/build-kylin-r113.py` | 从授权 R11.2 离线基线组合 R11.3；支持 `--public` 去除组织配置 |
| `scripts/verify-r113-archive.py` | 检查插件散列、原内核散列、Shell LF、ARM64 canvas及公开包无默认seed |
| `scripts/test-r113-*` | 文件、OCR、Host/Agent、定时投递/重启和桌面测试 |

`release-source/kylin-r11.2` 是历史发布快照；本版修改和新插件优先看上表。根目录独立开发构建与旧组织发行包的配置体系仍有差异，不能直接用旧 bootstrap 覆盖开发版。

## 安装与使用

在麒麟 ARM64 新的可写目录解压，进入应用根目录：

```sh
sh plugin-pack/安装插件.sh
sh start.sh
```

GitHub 公开版先执行 `sh 配置模型.sh`；需要 Dify 时执行 `sh 配置RAG.sh`。组织内网版保留原加密默认模型及 RAG 配置，不含聊天、钉钉绑定或 DWS 登录状态。不要把组织版上传公开仓库。

设置→技能孵化器提供用法；对话中描述流程并先要求预览。技能写在该安装的数据目录 `data/dsh/skills`，通过标准技能注册表发现；不得把凭据放进技能正文。

将 PDF 拖入聊天或使用 `pdf_parse` 解析当前工作区文件。单文件上限 64 MiB，OCR 每次最多20页；长文档按插件索引/分段流程读取。中文扫描件、表格、公式和低质量图片应核对原页。并非专业排版还原工具。TIFF、旧Office及可选高保真后端不在本版新增验收承诺中。

## 定时任务的边界

- 可创建一次性、固定间隔、每日、每周和 cron 任务；应明确时区。
- Host 必须保持运行；关闭APP、睡眠或关机后不会在原定时刻执行，重启后按内核规则补投递。
- 内核记录的是会话收件箱投递，不等于业务执行成功，也不保证严格仅执行一次。表格写入、发消息等仍遵循已有授权；不能通过设置定时任务扩大权限。
- 本版不安装系统常驻服务、不添加系统开机任务、不自动发送钉钉测试消息。

## 构建

独立开发版在目标平台/CPU使用 Node 24.x：

```sh
npm ci
npm run prepare:runtime
npm run prepare:plugins
npm run build
```

依赖准备需要在组织允许的联网构建环境完成，再将整套运行材料搬入内网。运行已打包 APP 不需要 npm、pip 或外网下载。

复用组织 R11.2 发行基线的流程：准备新插件生产依赖与同架构资源后，运行：

```sh
python scripts/build-kylin-r113.py --baseline /secure/path/R11.2-Full.tar.gz --output /secure/path/R11.3-Internal.tar.gz
python scripts/build-kylin-r113.py --baseline /secure/path/R11.2-Full.tar.gz --output dist/R11.3-Public.tar.gz --public
python scripts/verify-r113-archive.py dist/R11.3-Public.tar.gz
```

Windows 上组合已有 ARM64 归档不等于交叉构建了新内核：已有内核/运行时原样沿用，新增加的原生 canvas 必须使用锁定的 Linux ARM64 GNU 二进制并在 ARM64 环境验证。公开发行版使用安装目录本地生成的配置密钥，不包含原组织共享密钥或seed。密钥文件不能提交Git。

## 验证证据

最终结果以发行资产中的 `validation.json` 为准；未验证项目不得写成通过。使用本地合成模型验证工具循环，不代表实际组织模型质量。ARM64 Ubuntu/QEMU 不能替代真实麒麟 V10 验收；内网模型、Dify、钉钉和真实表格的连通/业务测试需组织现场完成。

已有 RAG 适配器的组织版证书校验技术债仍见 R11.2 交接文档；本次没有扩大该行为到 PDF/OCR。第三方包许可证随离线包保留，移植来源固定在各插件 upstream.json。
