# 内网小智 R11.4

支持 **麒麟 ARM64** 与 **Windows 10/11 x64**。当前应用发行版本是 **R11.4**；官方内核仍为 **DSH 0.2.0-rc.2**，应用版本和内核版本分别管理。

本版包含模型对话、RAG、业务接口、钉钉机器人与 AI 表格、原生定时任务、技能孵化器、离线 PDF/中英文 OCR、Playwright 浏览器，以及独立离线插件安装/升级/回退。首页移除“预览版”，加载页和首页显示“内网小智”主标题、“你说我做”副标题；工具参数按需发现，减少重复系统提示词。钉钉仍需组织网络和授权；APP 关闭时定时任务不执行。

## 下载与拆包原因

从 [GitHub Releases](https://github.com/xddzb/neiwang-xiaozhi/releases/latest) 下载与系统对应的两包：

| 平台 | 核心包 | 插件包 |
| --- | --- | --- |
| 麒麟 ARM64 | `Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Core.tar.gz` | `Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Plugins.tar.gz` |
| Windows 10/11 x64 | `Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Core.zip` | `Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Plugins.zip` |

**内网钉钉只允许上传 500MB 以内文件，所以每个平台拆成 Core、Plugins 两包。** 两包解压到同一个新目录，再运行插件安装器即可；不能用 `cat` 拼接。各包 SHA256 和已验证范围见 Release 描述。

GitHub 只发布 Public 包，不含组织模型/RAG凭据、内部接口定义或真实接口文档。供本组织内传递的 Internal 麒麟包单独在本地生成，保留当前模型、RAG加密默认配置、本地接口文档和接口源，禁止上传公开仓库。不要把 Public 和 Internal 两类包混用。

## 本地合并安装代码

麒麟：

```sh
mkdir -p R11.4
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Core.tar.gz -C R11.4
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Plugins.tar.gz -C R11.4
cd R11.4/Neiwang-Xiaozhi-Kylin-ARM64-R11.4
sh plugin-pack/安装插件.sh
# 首次使用 Public 包需配置；迁移旧配置见下方。
sh 配置模型.sh
sh 配置RAG.sh
sh start.sh
```

Internal 内网交付版已内置固定模型、RAG和接口资料，不需要旧 APP、迁移或首次配置。请直接按 [内网版安装说明](docs/INTERNAL_INSTALL.md) 合并安装并启动；上面的首次配置步骤仅用于 Public 包。

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Path .\R11.4 -ErrorAction Stop
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Core.zip -DestinationPath .\R11.4
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Plugins.zip -DestinationPath .\R11.4
Set-Location .\R11.4\Neiwang-Xiaozhi-Win10-x64-R11.4
& .\runtime\node\node.exe .\plugin-pack\install.cjs
& .\配置模型.cmd
& .\配置RAG.cmd
& .\start.cmd
```

## 升级并保留旧配置

关闭新旧 APP，将新版解压到独立新目录并安装插件。不要覆盖旧目录。在新 APP 根目录、首次启动前运行：

```sh
# 麒麟：只读取旧目录，补充新版缺失的配置，保留新版已修改设置
./runtime/node/bin/node tools/migrate-settings.cjs "/旧APP完整目录"
```

```powershell
# Windows PowerShell
& .\runtime\node\node.exe .\tools\migrate-settings.cjs 'C:\旧APP完整目录'
```

可迁移模型、RAG和开关、钉钉绑定、DWS设置、用户profile配置、业务接口源/连接、本地接口文档。旧版加密模型与RAG按新安装的本地密钥重新加密，不输出明文；原目录保持不动；与随包散列相同的未修改模板可由旧配置替换，已修改的新配置保留。它不复制聊天、整个工作区或浏览器缓存；跨电脑的系统密钥/登录状态可能需要重新授权。自定义数据目录及迁移边界见 [R11.4 安装与配置保留说明](docs/R11_4_INSTALL.md)。

后续仅新增或升级插件，使用 [独立离线插件管理器](docs/OFFLINE_PLUGIN_MANAGER.md)，无需重装 APP。初始 Core/Plugins 组合包和后续独立插件包是两种格式，不能混用。

## 项目目录和内核位置

| 源码目录 | 用途 | APP内位置 |
| --- | --- | --- |
| `launcher/` | 启动、桌面壳、品牌与运行环境适配 | `launcher/` |
| `extensions/` | 自有插件、PDF/OCR、技能孵化器、浏览器等 | `extensions/node_modules/` |
| `tools/` | 模型/RAG/钉钉配置、接口适配、插件管理、配置迁移 | `tools/` |
| `config/` | 不含凭据的部署模板，开发主线为 R11.4-dev | `config/` |
| `scripts/` | 当前构建、发布、验证和历史基线适配工具 | 构建时使用 |
| `docs/` | 安装、升级、开发及验证记录 | `docs/` |
| `manifests/` | 依赖来源、完整性与验证记录 | `manifests/` |
| `private-docs/` | 公开空白模板；真实文档由本地加入、不入库 | `private-docs/` 或 `offline-api-tool/` |
| `release-source/kylin-r11.3/` | 保留的历史发布源码快照，不是当前发行目录 | 不用于覆盖新版 |

**官方内核在 APP 的 `core/0.2.0-rc.2/node_modules/`。** `runtime/` 提供平台运行库，`launcher/electron/` 是桌面运行时；定制代码在内核外。`data/` 保存模型/RAG、用户profile、机器人绑定等私有配置；`workspace/` 是用户文件。两者不得被升级覆盖或提交 Git。

## 从源码构建和验证

当前普通开发构建见 [BUILD_AND_RUN](docs/BUILD_AND_RUN.md)：安装 Node 24.x（至少24.9）、Git、Python 3.10+，在目标平台执行 `npm ci`、`npm run prepare:runtime`、`npm run prepare:plugins`、`npm run build`。这些准备步骤在联网构建机完成，APP运行和插件安装不联网补下载。

R11.4 已审查发行基线组合与公开/内部包分离流程见 [R11.4 发布交接](docs/R11_4_HANDOVER.md)，使用 `scripts/build-r114-release.py`，需显式提供本地平台基线及私有输入。它不把组织资料提交到仓库，也不修改旧 APP。

```sh
python scripts/check_source.py
npm test
node --test scripts/test-plugin-manager.cjs scripts/test-settings-migration.cjs scripts/test-browser-patch.cjs scripts/test-browser-controller.mjs
```

实际发布验证结果和边界见 Release 描述与仓库验证清单。第三方许可证按原组件保留；协作约定见 [CONTRIBUTING](CONTRIBUTING.md)。
