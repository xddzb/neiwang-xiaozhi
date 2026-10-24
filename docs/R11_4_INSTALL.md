# 内网小智 R11.4 安装、合并与配置保留

R11.4 提供麒麟 ARM64 和 Windows 10/11 x64。每个平台分为 Core 核心包与 Plugins 插件包：**内网钉钉只允许上传 500MB 以内的文件**，所以拆成两包。它们是同一个 APP 的两个部分，必须匹配平台、版本和 Public/Internal 版本类型；不是分卷压缩，不能用 `cat` 拼接。

Core 包含未修改的 DSH 0.2.0-rc.2 内核、桌面壳、Node/Python、模型/RAG配置入口和迁移工具；Plugins 包含业务接口、钉钉机器人、AI表格、PDF/OCR、技能孵化器和 Playwright。原生定时任务随内核提供；APP关闭、休眠或关机时不执行，不保证补投递业务恰好一次。

## 麒麟：本地合并两包

将两包放入同一个目录。在终端执行，以下示例为 GitHub Public 包：

```sh
mkdir -p R11.4
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Core.tar.gz -C R11.4
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Plugins.tar.gz -C R11.4
cd R11.4/Neiwang-Xiaozhi-Kylin-ARM64-R11.4
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
New-Item -ItemType Directory -Path .\R11.4 -ErrorAction Stop
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Core.zip -DestinationPath .\R11.4
Expand-Archive -LiteralPath .\Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Plugins.zip -DestinationPath .\R11.4
Set-Location .\R11.4\Neiwang-Xiaozhi-Win10-x64-R11.4
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
Neiwang-Xiaozhi-<平台>-R11.4/
├─ core/0.2.0-rc.2/       官方内核及锁定的平台依赖，不直接修改
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

本版包含“内网小智”32px /“你说我做”18px 品牌层级、隐藏首页预览版徽标、工具参数按需发现，减少系统提示词的重复声明。后续独立插件可以通过 `tools/offline-plugin-manager.cjs` 安装、升级、回退，不必重装 APP。初始 Core/Plugins 组合包用于新安装；后续插件升级使用独立格式，见 `docs/OFFLINE_PLUGIN_MANAGER.md`。

GitHub 公开包不含组织凭据、内部接口定义或真实本地文档。Internal 两包仅在组织内传递，不上传公开仓库。SHA256 见本地同名 `.sha256` 文件或 GitHub Release 描述。发布验证不替代原生麒麟桌面、组织 SSO、证书和实际业务现场验收。
