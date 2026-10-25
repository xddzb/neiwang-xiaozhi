# 内网小智 —— 安装与使用

R11.6为本次构建版本，提供麒麟 ARM64 和 Windows 10/11 x64。每个平台分为 Core 核心包与 Plugins 插件包：**内网钉钉只允许上传 500MB 以内的文件**，所以拆成两包。它们是同一个 APP 的两个部分，必须匹配平台、版本和 Public/Internal 版本类型；不是分卷压缩，不能用 `cat` 拼接。

Core 包含未修改的 DSH 0.2.1-rc.3 内核、桌面壳、Node/Python、模型/RAG配置入口和迁移工具；Plugins 包含业务接口、钉钉机器人、AI表格、better-sidebar、技能孵化器和 Playwright。原生定时任务随内核提供；APP关闭、休眠或关机时不执行，不保证补投递业务恰好一次。

内网 Internal 交付版已内置固定模型、RAG和接口资料，不需要旧APP、迁移或首次配置。直接安装步骤见 [本文内网安装步骤](#内网固定配置版安装)。下文首次配置和迁移步骤用于 Public 包或明确需要导入旧设置的场景。

## 内网固定配置版安装

Internal包已预置模型、RAG、本地接口文档和接口源，不需要旧APP、迁移或首次配置。将两包和合并脚本放在同一目录，执行：

```sh
sh 合并安装R11.6.sh "/data/内网小智R11.6"
sh "/data/内网小智R11.6/Neiwang-Xiaozhi-Kylin-ARM64-R11.6/start.sh"
```

钉钉绑定/组织账号授权仍由本人完成。以下为R11.6交付命令；GitHub已发布旧包的安装应将版本号统一换成对应发行版本，不能混用新旧Core/Plugins。

## 麒麟Public包：本地合并两包

将两包放入同一个目录。在终端执行，以下示例为 GitHub Public 包：

```sh
mkdir -p R11.6
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.6-Public-Core.tar.gz -C R11.6
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.6-Public-Plugins.tar.gz -C R11.6
cd R11.6/Neiwang-Xiaozhi-Kylin-ARM64-R11.6
sh plugin-pack/安装插件.sh
# 首次使用公开包，配置自己的模型和知识库；从旧版迁移则用下一节命令。
sh 配置模型.sh
sh 配置RAG.sh
sh start.sh
```

内网交付包将上面两个文件名中的 `Public` 换成 `Internal`，其余命令相同。Internal 包已保留构建电脑现有的模型、RAG 加密默认配置、本地接口文档和恢复的接口定义，可跳过首次配置步骤。它不预置 Windows 机器人的绑定，原麒麟绑定通过旧目录迁移保留。

用旧 APP 所属用户执行，不要 sudo。解压到新目录，**不要覆盖旧 APP，也不要把新旧 `data/` 或 `config/` 互相覆盖**。插件安装器验证版本、平台和文件散列；重复安装同一包不改已有配置，有冲突时停止。

## Windows：本地合并两包

在 PowerShell 中执行：

```powershell
New-Item -ItemType Directory -Path .\R11.6 -ErrorAction Stop
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.6-Public-Core.zip -DestinationPath .\R11.6
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.6-Public-Plugins.zip -DestinationPath .\R11.6
Set-Location .\R11.6\Neiwang-Xiaozhi-Win10-x64-R11.6
& .\runtime\node\node.exe .\plugin-pack\install.cjs
# 首次使用公开包时配置；旧版迁移见下方。
& .\配置模型.cmd
& .\配置RAG.cmd
& .\start.cmd
```

Windows 包不适用 Windows 7、Windows ARM64 或麒麟。不要将两个平台的包混装。

## 从旧目录保留配置

先关闭新旧 APP，备份旧目录。在**新 APP 根目录**、首次启动前执行：

```sh
# 麒麟
./runtime/node/bin/node tools/migrate-settings.cjs "/旧APP完整路径"
```

```powershell
# Windows PowerShell
& .\runtime\node\node.exe .\tools\migrate-settings.cjs 'C:\旧APP完整路径'
```

迁移工具只读取旧目录，向新目录补充缺失文件：模型与 RAG、RAG 开关等 `data/config` 设置、钉钉配置与绑定、DWS 配置、用户 profile 配置、业务接口源与连接、`offline-api-tool`/`private-docs`/`晓光agent` 本地资料。模型/RAG按新安装的本地密钥重新加密，不输出明文密钥。新目录已修改的设置保留；与随包散列一致、尚未修改的接口模板、接口文档和默认模型/RAG会由旧配置替换，避免空模板遮住原配置。重复运行不重复覆盖。

不迁移聊天记录、整个工作区、浏览器缓存或 `node_modules`。这些旧资料仍留在原目录。采用自定义 `NEIWANG_DATA_DIR` 的安装应先将该实际数据目录备份到迁移副本的 `data/` 再迁移。跨电脑或跨系统的 DPAPI、系统钥匙串、浏览器登录状态不能靠复制恢复，需要重新登录。迁移配置不代表账号授权或网络已连通。

## 当前目录与后续升级

```text
Neiwang-Xiaozhi-<平台>-R11.6/
├─ core/0.2.1-rc.3/       官方内核及锁定的平台依赖，不直接修改
├─ launcher/              桌面壳、品牌与启动适配
├─ runtime/               当前平台的 Node、Python、Electron 配套资源
├─ config/                发行配置；Internal 的 defaults/ 仅用于首次初始化
├─ plugin-pack/           本次 Plugins 解压得到的离线安装载荷
├─ extensions/            安装后的独立插件、业务接口源/连接
├─ tools/                 配置入口、离线插件管理、配置迁移
├─ offline-api-tool/      Internal 中的本地接口文档与查看工具
├─ data/                  首次启动/迁移后生成，模型、RAG、绑定等用户配置
└─ workspace/             用户工作区，升级不得覆盖
```

本版包含“内网小智”32px /“你说我做”18px 品牌层级、隐藏首页预览版徽标、工具参数按需发现，减少系统提示词的重复声明。后续独立插件可以通过 `tools/offline-plugin-manager.cjs` 安装、升级、回退，不必重装 APP。初始 Core/Plugins 组合包用于新安装；后续插件升级使用独立格式，见 `DEVELOPMENT.md`。

GitHub 公开包不含组织凭据、内部接口定义或真实本地文档。Internal 两包仅在组织内传递，不上传公开仓库。SHA256 见本地同名 `.sha256` 文件或 GitHub Release 描述。发布验证不替代原生麒麟桌面、组织 SSO、证书和实际业务现场验收。

## R11.6 功能检查

两包必须同版本、同平台并解压到同一目录；启动器会校验本地插件包后安装，不在线下载。缺包时补齐Plugins后重新启动。手动插件安装入口仍可用。

打开首页后，左侧底部应有“检索增强开关”，侧边栏可打开文件和工作台；发出一条用户消息后，消息操作区应有回退按钮。仅消息回退保留原聊天并创建分支；涉及文件恢复时核对预览与确认，远端接口、已发送消息和表格修改不会随本地回退而撤销。系统提示词精简开关位于设置中的“业务浏览器与接口”。

回退插件的文件检查点需要系统Git在PATH中；仅回溯消息不依赖Git。首次安装会校验并复制本地插件，请等待完成后再启动其他实例。

若首次插件安装被中断：先关闭该APP所有进程，再在APP根目录运行 `./runtime/node/bin/node plugin-pack/install.cjs --recover`（Windows使用 `& .\runtime\node\node.exe .\plugin-pack\install.cjs --recover`）。它重新校验已有文件后续装，不删除用户文件；仍在运行的安装器或损坏的锁记录会被拒绝。增量插件管理器中断仍使用 `管理插件.sh recover`，两种恢复入口不能混用。
