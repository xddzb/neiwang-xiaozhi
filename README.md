# 内网小智

支持 **麒麟 ARM64** 与 **Windows 10/11 x64**。本次版本 **R11.6 / DSH 0.2.1-rc.3**，恢复检索增强、侧边栏、消息回退与精简工具提示词；不包含PDF解析大师。下载与发布状态以 [R11.6 Release](https://github.com/xddzb/neiwang-xiaozhi/releases/tag/r11.6) 为准，每次语义化修改见 [详细技术交接](docs/HANDOVER.md)。

提供模型对话、RAG、业务接口、钉钉机器人与 AI 表格、原生定时任务、技能孵化器、Playwright 浏览器，以及独立离线插件安装/升级/回退。首页和加载页显示“内网小智 / 你说我做”，移除“预览版”和编辑菜单；工具参数按需发现以精简系统提示词。钉钉仍需组织网络和授权；APP关闭时定时任务不执行。

文档入口：[详细技术交接与修改日志](docs/HANDOVER.md) · [安装与使用](docs/INSTALL.md) · [开发、构建和插件维护](docs/DEVELOPMENT.md)。

开发中、尚未打包的证书兼容修改：业务浏览器与 `business_api` 的HTTPS请求按部署要求忽略证书链和主机名校验，适用于各自访问的所有HTTPS站点/已登记接口；不改变其他客户端的TLS策略。此兼容方案无法验证服务身份，取得组织CA后应恢复校验。当前GitHub R11.6安装包尚不包含此项，验证与适用范围见详细技术交接的“未发布”条目。

## 本版恢复的功能

- 检索增强开关放在侧边栏底部；全应用持久化，关闭后主、子智能体均不新增RAG请求，原有材料可复用。
- better-sidebar 0.28.0 的文件、预览与工作台入口随插件包完整启用。
- 用户消息旁的回退入口支持保留原聊天并创建分支；涉及文件恢复先预览并由用户确认，不自动撤销远端接口、钉钉消息或表格操作。
- 工具通过 run_code 按需查询目录与参数，精简SDK系统提示词，保留授权和安全规则。
- 两包缺失或损坏时明确报错，避免静默启动为缺功能状态。

## 下载与拆包原因

从 [GitHub Releases](https://github.com/xddzb/neiwang-xiaozhi/releases/latest) 下载与系统对应的两包：

| 平台 | 核心包 | 插件包 |
| --- | --- | --- |
| 麒麟 ARM64 | `Neiwang-Xiaozhi-Kylin-ARM64-R11.6-Public-Core.tar.gz` | `Neiwang-Xiaozhi-Kylin-ARM64-R11.6-Public-Plugins.tar.gz` |
| Windows 10/11 x64 | `Neiwang-Xiaozhi-Win10-x64-R11.6-Public-Core.zip` | `Neiwang-Xiaozhi-Win10-x64-R11.6-Public-Plugins.zip` |

**内网钉钉只允许上传 500MB 以内文件，所以每个平台拆成 Core、Plugins 两包。** 两包解压到同一个新目录，首次启动自动校验并安装本地插件，也可先手动运行安装器；不能用 `cat` 拼接。各包 SHA256 和已验证范围见 Release 描述。

GitHub 只发布 Public 包，不含组织模型/RAG凭据、内部接口定义或真实接口文档。供本组织内传递的 Internal 麒麟包单独在本地生成，保留当前模型、RAG加密默认配置、本地接口文档和接口源，禁止上传公开仓库。不要把 Public 和 Internal 两类包混用。

## 本地合并安装代码

麒麟：

```sh
mkdir -p R11.6
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.6-Public-Core.tar.gz -C R11.6
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.6-Public-Plugins.tar.gz -C R11.6
cd R11.6/Neiwang-Xiaozhi-Kylin-ARM64-R11.6
sh plugin-pack/安装插件.sh
# 首次使用 Public 包需配置；迁移旧配置见下方。
sh 配置模型.sh
sh 配置RAG.sh
sh start.sh
```

Internal 内网交付版已内置固定模型、RAG和接口资料，不需要旧 APP、迁移或首次配置。请直接按 [内网版安装说明](docs/INSTALL.md) 合并安装并启动；上面的首次配置步骤仅用于 Public 包。

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Path .\R11.6 -ErrorAction Stop
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.6-Public-Core.zip -DestinationPath .\R11.6
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.6-Public-Plugins.zip -DestinationPath .\R11.6
Set-Location .\R11.6\Neiwang-Xiaozhi-Win10-x64-R11.6
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

可迁移模型、RAG和开关、钉钉绑定、DWS设置、用户profile配置、业务接口源/连接、本地接口文档。旧版加密模型与RAG按新安装的本地密钥重新加密，不输出明文；原目录保持不动；与随包散列相同的未修改模板可由旧配置替换，已修改的新配置保留。它不复制聊天、整个工作区或浏览器缓存；跨电脑的系统密钥/登录状态可能需要重新授权。自定义数据目录及迁移边界见 [R11.6 安装与配置保留说明](docs/INSTALL.md)。

后续仅新增或升级插件，使用 [独立离线插件管理器](docs/DEVELOPMENT.md)，无需重装 APP。初始 Core/Plugins 组合包和后续独立插件包是两种格式，不能混用。

## 项目目录和内核位置

| 源码目录 | 用途 | APP内位置 |
| --- | --- | --- |
| `launcher/` | 启动、桌面壳、品牌与运行环境适配 | `launcher/` |
| `extensions/` | 自有插件、侧边栏、技能孵化器、浏览器等 | `extensions/node_modules/` |
| `tools/` | 模型/RAG/钉钉配置、接口适配、插件管理、配置迁移 | `tools/` |
| `config/` | 不含凭据的部署模板，开发主线为 R11.6-dev | `config/` |
| `scripts/` | 当前构建、发布、验证和历史基线适配工具 | 构建时使用 |
| `docs/` | 安装、升级、开发及验证记录 | `docs/` |
| `manifests/` | 依赖来源、完整性与验证记录 | `manifests/` |
| `private-docs/` | 公开空白模板；真实文档由本地加入、不入库 | `private-docs/` 或 `offline-api-tool/` |
| `config/workspace-rules.md` | APP统一中文与授权规则模板 | 随新构建发布 |

**官方内核在 APP 的 `core/0.2.1-rc.3/node_modules/`。** `runtime/` 提供平台运行库，`launcher/electron/` 是桌面运行时；定制代码在内核外。`data/` 保存模型/RAG、用户profile、机器人绑定等私有配置；`workspace/` 是用户文件。两者不得被升级覆盖或提交 Git。

## 从源码构建和验证

当前普通开发构建见 [BUILD_AND_RUN](docs/DEVELOPMENT.md)：安装 Node 24.x（至少24.9）、Git、Python 3.10+，在目标平台执行 `npm ci`、`npm run prepare:runtime`、`npm run prepare:plugins`、`npm run build`。这些准备步骤在联网构建机完成，APP运行和插件安装不联网补下载。

R11.6 已审查发行基线组合与公开/内部包分离流程见 [R11.6 发布交接](docs/HANDOVER.md)，使用 `scripts/build-r114-release.py`，需显式提供本地平台基线及私有输入。它不把组织资料提交到仓库，也不修改旧 APP。

```sh
python scripts/check_source.py
npm test
node --test scripts/test-plugin-manager.cjs scripts/test-settings-migration.cjs scripts/test-browser-patch.cjs scripts/test-browser-controller.mjs
```

实际发布验证结果和边界见 Release 描述与仓库验证清单。第三方许可证按原组件保留；协作约定见 [CONTRIBUTING](CONTRIBUTING.md)。
