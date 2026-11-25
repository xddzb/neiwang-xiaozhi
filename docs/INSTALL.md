# 内网小智 —— 安装与使用

## 浏览器参数离线补丁

`Neiwang-Kylin-ARM64-Browser-Fix-1.0.1.tar.gz` 是已有APP的增量补丁，不是完整 APP 安装包。适用于麒麟Linux ARM64、随包Node 24、DSH 0.2.1-rc.3，要求浏览器插件已安装、Playwright 1.56.1已随包存在，并保留 `plugin-pack/payload` 和 `pack.json`。无需联网、sudo、npm、Python或重装APP。不适用旧内核0.2.0-rc.2；兼容检查失败时不会覆盖文件。

1. 完全退出APP及业务浏览器（定时任务也会随APP停止），将tar.gz和对应sha256文件放在同一目录。
2. 在普通用户终端运行，示例中的APP路径替换为你原来实际使用的目录：

```sh
sha256sum -c Neiwang-Kylin-ARM64-Browser-Fix-1.0.1.tar.gz.sha256
tar -xzf Neiwang-Kylin-ARM64-Browser-Fix-1.0.1.tar.gz
cd Neiwang-Kylin-ARM64-Browser-Fix-1.0.1
sha256sum -c SHA256SUMS.txt
sh 检查补丁.sh "/原来使用的内网小智APP目录"
sh 安装补丁.sh "/原来使用的内网小智APP目录"
```

显示 `INSTALLED` 后按原方式启动APP。重复安装返回 `UNCHANGED`。不需要配置或迁移模型、RAG、钉钉，也不切换data/workspace目录。默认只更新浏览器的controller、工具入口、精简提示、启动入口和package/lock版本（1.0.1），同时写入运行副本、本地打包载荷和 `plugin-pack/pack.json` 散列；若浏览器已登记到独立插件管理器，同步其版本/treeHash。Playwright依赖、其余插件、接口源、登录态、模型、RAG、钉钉绑定和工作区文件不改动。

补丁包含现有业务浏览器忽略证书校验的启动参数，作用于该浏览器所有HTTPS目标；不会改变Python接口、模型或RAG的TLS策略。它不能验证服务身份，取得组织CA后应恢复校验。此补丁不更新 `api_tool.py`。

原始字节、文件权限和变更清单自动备份到APP的 `extensions/.plugin-manager/transactions/browser-url-*/browser-journal.json`，位置不含用户模型等配置副本。请保留该目录和补丁解压目录，以便回退。若提示运行目录、打包载荷、原清单不一致，先停止，不要手工删校验或强制覆盖。

需要回退时，先退出APP，再运行：

```sh
sh 回退补丁.sh "/原来使用的内网小智APP目录"
```

断电/终端被强制关闭后，先退出APP，运行 `sh 恢复补丁.sh "/原来使用的内网小智APP目录"`，它恢复本次修改前的字节与清单；然后重新检查和安装。普通安装错误会自动尝试还原。补丁完成后若又改动了受保护文件或升级了其他插件，回退将拒绝覆盖，须先还原后续改动。本补丁使用随包的回退脚本，不使用通用插件管理器的rollback来撤销此增量事务。

## 当前完整 APP：连续分卷交付

麒麟 ARM64 和 Windows 10/11 x64 均以预装插件的完整应用交付，再将压缩文件切为连续分卷。每卷最大 480,000,000 字节，低于 500 MB；不再要求用户分别安装 Core 和 Plugins。

### Windows

将同一批 `.zip.001`、`.zip.002` 等全部分卷，以及 `volumes.json`、`Extract.ps1`、`DoubleClickExtract.cmd` 放在同一目录。双击 `DoubleClickExtract.cmd`，等待校验、合并和解压完成。进入 `ExtractedApp` 下的应用目录，双击 `start.cmd` 或“内网小智.exe”。请预留至少 8 GB 空间；目标目录必须是新目录，不覆盖旧 APP。单独一卷不是完整 ZIP。

### 麒麟

将全部 `.tar.gz.001`、`.tar.gz.002` 等连续分卷、`SHA256SUMS.txt` 和 `解压.sh` 放在同一目录。在麒麟执行 `sh 解压.sh`，完成后进入生成的应用目录运行 `bash start.sh`。脚本按顺序合并压缩数据并解压，保留权限和链接；不要先在 Windows 展开目录再逐文件搬运。

Internal 包已预置加密的默认模型/RAG 配置及接口资料，可直接启动；新 API 通过“设置 → 模型 → 添加提供商”新增，不替换原内网加密默认 API。Public 包不含组织凭据，需自行配置服务。不要混用平台、日期或 Public/Internal 分卷。

### 历史 Core / Plugins 归档

历史 Release 中带 `Core` 和 `Plugins` 的 ZIP/tar.gz 是两个独立归档，须同版本、同平台、同类型，分别解压到同一新父目录，再按旧包说明安装本地插件。**不能将这种历史归档按字节拼接。** 它们仍可作为构建材料；GitHub 文档更新不表示历史 Release 已替换。

## Windows 上下文、工具调用与新增模型 API 补丁

适用于 R11.6 / DSH 0.2.1-rc.3 / Windows x64 / 浏览器 1.4.1 或 1.4.2，要求保留完整离线载荷及默认 APP/data。

退出 APP，将 ZIP 解压后的整个 `WindowsPatch` 文件夹放到 APP 内，与 `start.cmd` 同级。双击 `InstallPatch.cmd`，显示 `installed` 后重启；`CheckPatch.cmd` 只检查，`RollbackPatch.cmd` 回退，`RecoverPatch.cmd` 恢复中断事务。

本补丁包含工具目录与调用说明修复、上下文预算修复、模型设置入口启用。原 `model.enc`、`.local-key` 及随包加密默认配置不改写，不导出明文；新增 API 按应用原有用户模型设置机制保存，不宣称新增 API 使用同一加密格式。支持叠加此前补丁，保留备份并按后装先退顺序回退。补丁很小，单个 ZIP 即可传入内网。

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
├─ plugin-pack/           完整 APP 内保留的离线插件载荷
├─ extensions/            安装后的独立插件、业务接口源/连接
├─ tools/                 配置入口、离线插件管理、配置迁移
├─ offline-api-tool/      Internal 中的本地接口文档与查看工具
├─ data/                  首次启动/迁移后生成，模型、RAG、绑定等用户配置
└─ workspace/             用户工作区，升级不得覆盖
```

本版包含“内网小智”32px /“你说我做”18px 品牌层级、隐藏首页预览版徽标、工具参数按需发现，减少系统提示词的重复声明。后续独立插件可以通过 `tools/offline-plugin-manager.cjs` 安装、升级、回退，不必重装 APP。完整 APP 分卷用于新安装；后续插件升级使用独立格式，见 `DEVELOPMENT.md`。

GitHub 公开包不含组织凭据、内部接口定义或真实本地文档。Internal 分卷及补丁仅在组织内传递，不上传公开仓库。SHA256 见本地同名 `.sha256` 文件或 GitHub Release 描述。发布验证不替代原生麒麟桌面、组织 SSO、证书和实际业务现场验收。

## R11.6 功能检查

全部分卷必须来自同一批完整构建；缺卷或散列不匹配时补齐原分卷后重新解压。当前完整包已预装插件，不需首次再装。历史 Core/Plugins 才使用首次插件安装入口。

打开首页后，左侧底部应有“检索增强开关”，侧边栏可打开文件和工作台；发出一条用户消息后，消息操作区应有回退按钮。仅消息回退保留原聊天并创建分支；涉及文件恢复时核对预览与确认，远端接口、已发送消息和表格修改不会随本地回退而撤销。系统提示词精简开关位于设置中的“业务浏览器与接口”。

回退插件的文件检查点需要系统Git在PATH中；仅回溯消息不依赖Git。历史包首次安装会校验并复制本地插件，请等待完成后再启动其他实例。

若首次插件安装被中断：先关闭该APP所有进程，再在APP根目录运行 `./runtime/node/bin/node plugin-pack/install.cjs --recover`（Windows使用 `& .\runtime\node\node.exe .\plugin-pack\install.cjs --recover`）。它重新校验已有文件后续装，不删除用户文件；仍在运行的安装器或损坏的锁记录会被拒绝。增量插件管理器中断仍使用 `管理插件.sh recover`，两种恢复入口不能混用。


## ISU实时值：登录后自动复用（浏览器插件1.2.0）

在内置业务浏览器登录ISU，打开或刷新实时值页面，等待页面建立已知socket.io连接，再让小智按点名查询。无需导出请求或复制Token/Cookie；未捕获到连接时会返回isu_browser_token_pending。浏览器关闭后Token不保留，重新打开实时值页面即可重新捕获；服务端登录失效仍需重新登录。

仅针对已有ISU接口监听，不新增接口登记、通用抓包、控制台或任意JS执行操作。其他已登记只读接口只复用Cookie和固定认证字段映射。Token来源不是推测的存储键，而是实际发出的已知ISU连接参数。

此功能需要同时更新浏览器插件、业务插件及配套Python工具，使用当前完整 APP 的全部分卷安装到新目录，不覆盖旧APP。内网固定配置、接口资料及安装包仅在组织内交付，GitHub只包含源码和合成测试。

同一站点多标签页使用不同Token时会拒绝选择；关闭旧账号标签页后刷新当前实时值页面。session-check只检查本地登录态可用，不证明服务端查询权限。返回的数据仍需核对PN/GN、DS、TM及是否存在多个匹配。
