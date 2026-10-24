# 内网小智

R11.3 麒麟 ARM64 发行采用 Core 核心包与 Plugins 插件包，两个包解压到同一目录后安装插件。详见[分包安装说明](docs/R11_3_SPLIT_INSTALL.md)。

内网钉钉只允许上传 500 MB 以内的文件，因此发行包拆分为核心包和插件包。内核保持原样，自有启动、配置及扩展在外部组合；当前插件安装器仍要求匹配发行版本。详见[内核与插件升级边界](docs/CORE_AND_PLUGIN_UPGRADES.md)。

2026-10-24：麒麟 ARM64 R11.3 新增原生定时任务、技能孵化器与离线 PDF/中英文 OCR，并更新首页文案。详见 [R11.3 交接与构建说明](docs/R11_3_HANDOVER.md)。新插件已在源码中提供；完整开发构建前增加 `npm run prepare:plugins`，实际发行验证结果以 Release 附带的 validation.json 为准。公开版不含组织模型、RAG 凭据及内部接口资料。

2026-10-23 补充：[麒麟 R11.2 开发交接文档](docs/HANDOVER_R11_2.html)及[发布源码快照](release-source/kylin-r11.2/source-manifest.json)。包含本次 RAG 漏配修复、Shell 换行修复、机器人/AI 表格适配和交付验证范围。根目录独立开发构建流程继续保留；快照需发行基线及运行时，不能直接启动。组织凭据、加密默认配置和内部发行包不上传。

内网小智的协作源码仓库。当前开发主线为 R11.3-dev，沿用独立开发构建架构：官方 DeepSeek Harness 内核、部署配置、自有扩展和用户数据分离；Windows x64 / 麒麟 ARM64 交付采用 Core 核心包与 Plugins 可选插件包。

## 源码目录

| 目录 | 用途 |
| --- | --- |
| `launcher/` | 桌面启动、内核运行环境、Electron 壳与品牌资源 |
| `extensions/` | 独立部署、品牌、工具目录、钉钉设置/绑定、DWS AI 表格适配源码 |
| `tools/` | 钉钉配置、DWS 登录、Python/PyInstaller、文档处理入口 |
| `config/` | 无凭据的部署模板 |
| `scripts/` | R10 核心/插件拆包、文档嵌入、完整性验证及历史适配脚本 |
| `docs/` | 安装说明、更新说明及开发指引 |

钉钉使用官方 `DingTalk-Real-AI/dsh-dingtalk` 0.10.2，源码在本仓库保留的是配置页面和集成层。DWS AI 表格调用官方 DWS CLI；PyInstaller 用于将授权的 Python 脚本打包。业务浏览器已移除。

## 开发与验证

同事从 GitHub 下载后，请先按 [从源码生成并运行 APP](docs/BUILD_AND_RUN.md) 操作；该文档包含依赖安装、构建命令、模型配置、钉钉和分发打包步骤。另见 [开发说明](docs/DEVELOPMENT.md) 和 [协作约定](CONTRIBUTING.md)。运行源码检查：

```sh
python scripts/check_source.py
```

开发版通过 `npm ci` 下载锁定依赖、`npm run prepare:runtime` 准备已校验的独立运行库、`npm run prepare:plugins` 准备离线 PDF/OCR 插件材料，`npm run build` 生成桌面 APP、`npm start` 启动，不再要求本机 R9 基线或预先配置模型密钥。首次启动在设置 → 模型中填写自己的服务和 API Key，可继续修改。完整命令及平台前提见构建运行指南。历史 R10 离线核心/插件包的脚本仍需发行基线，与新开发构建不同。

## 从源码生成完整 APP

安装 Node 24.x（至少 24.9.0）、Git 和用于构建准备的 Python 3.10+，在目标操作系统/架构执行：

```sh
npm ci
npm run prepare:runtime
npm run prepare:plugins
npm run build
# 用构建指南中对应平台的目录执行 npm run verify:app -- builds/<目录>
npm start
```

默认构建已包含钉钉、DWS AI 表格、独立 Python/PyInstaller；不再需要 --with-dingtalk。Windows 与麒麟必须分别在对应平台构建。完整步骤、离线材料缓存、分发打包和首次登录见 [构建运行指南](docs/BUILD_AND_RUN.md)。

## 接口文档与模型密钥在哪里

- **接口文档不在 tools 或 extensions 中**。原开发工程位置为工程根目录 `offline-api-tool/内网接口文档.html`，该真实文档未上传。现在提供 `private-docs/内网接口文档.template.html` 空白模板，复制为同目录的 `内网接口文档.html` 后内部填写，与 `tools/`、`extensions/` 平级，文档正文不入库，也不会自动启用业务接口。
- **开发版模型配置**：设置 → 模型。凭据保存在 `<APP根目录>/data/dsh/.credentials.yaml`，用户配置在 `<APP根目录>/data/dsh/profiles/web/cordis.patch.yml`。不提交这些文件。高级环境配置字段见 `.env.example`，但该模板不会自动加载。
- **原已交付 R10 发布版**仍使用 `<APP根目录>/data/config/model.enc`，与新开发版不同；不要把旧文件或启动器直接覆盖到开发版。

第三方组件保留其原有许可证。此仓库尚未为项目自有代码指定开源许可证；上传源码不代表授予第三方组件以外的额外许可。
