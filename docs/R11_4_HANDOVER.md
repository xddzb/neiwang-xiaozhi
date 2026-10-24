# 内网小智 R11.4 —— 麒麟 ARM64 / Windows 详细技术交接

更新日期：2026-10-24。面向接手开发、构建、内网部署及运维的同事。

本文件不含模型密钥、RAG密钥、组织服务地址、机器人凭据或真实接口文档。私有构建材料由组织通过内部渠道单独交接。用户提供的旧 HANDOVER.md 仅作为文档结构和历史问题参考，其中旧包名、路径和历史验收结论不代表本版状态。

## 1. 接手先看：交付目标与当前状态

目标是在纯内网麒麟 ARM64 上提供带图形界面的内网小智，同时提供 Windows x64 版。运行依赖随包提供，安装不要求访问 npm/PyPI，也不要求 sudo；模型和知识检索仍访问组织内已有的模型/RAG服务。

| 项目 | 当前状态 | 接手时注意 |
|---|---|---|
| 当前 APP / 内核 | R11.4 / DSH 0.2.0-rc.2 | 不直接修改官方内核 |
| 内网固定配置 | Internal 包内置模型、RAG、接口资料 | 不依赖旧APP，不执行首次配置或迁移 |
| Windows 桌面 | 已启动并验证页面加载 | x64，不适用 Windows ARM64 |
| 麒麟运行 | ARM64 隔离环境测试通过 | 实体麒麟桌面及组织服务仍需现场验收 |
| 独立插件更新 | 已有离线安装、升级、恢复和回退 | 不能直接复制任意插件目录当作安装 |
| 浏览器自动化 | Playwright 控制随包 Electron | 中广核本机浏览器接入尚未实现 |
| 敏感操作审批 | 内核审批、钉钉管理员验证已有基础 | 插件尚未统一强制真人审批 |

## 2. 平台与运行基线

| 组件 | 本版基线 |
|---|---|
| 麒麟目标架构 | Linux aarch64 / arm64，银河麒麟 V10 系列需现场检查桌面库 |
| Windows | Windows 10/11 x64 |
| Node | 24.9.0 随包运行时 |
| Electron | 33.2.0 平台对应版本 |
| Python | 麒麟 Python 3.11；Windows Python 3.12.14；均使用随包运行时 |
| Playwright | playwright-core 1.56.1，离线依赖随插件提供 |
| DWS CLI | 1.0.65；组织授权不因离线打包自动获得 |
| 文件传输 | 内网钉钉仅允许上传500MB以内文件，因此拆分 Core / Plugins |

旧文档记录的 Chromium 102 缺 API、PyPI runtime 依赖缺件、旧第三方桌面连接问题属于历史经验。本版已改用独立官方内核与启动适配层，不能把旧文档的“最终方案已实机验证”直接套到 R11.4。

## 3. 源码、内核和配置分别在哪里

仓库：[xddzb/neiwang-xiaozhi](https://github.com/xddzb/neiwang-xiaozhi)。最新安装资产：[R11.4 Release](https://github.com/xddzb/neiwang-xiaozhi/releases/tag/r11.4)。

```text
源码仓库/
├─ README.md                  当前版本及使用入口
├─ docs/                      交接、安装、插件管理及构建说明
├─ config/                    通用发行配置，不放真实组织凭据
├─ launcher/                  启动适配、桌面壳、品牌和RAG开关
├─ extensions/                自定义插件源码
├─ tools/                     离线插件管理与可选迁移工具
├─ scripts/                   构建、打包、审计和验证脚本
├─ manifests/                 公开验证记录
└─ release-source/kylin-r11.3/ 历史源码快照，不是当前开发目录
```

交付 APP 解压后的结构：

```text
Neiwang-Xiaozhi-<平台>-R11.4/
├─ core/0.2.0-rc.2/node_modules/ 官方内核与锁定依赖
├─ launcher/                    supervisor、bootstrap、桌面壳
├─ runtime/                     平台Node/Python等运行时
├─ config/app.json              版本、平台和启用插件清单
├─ config/defaults/             仅Internal随包固定配置（私有）
├─ plugin-pack/                 初始插件安装载荷
├─ extensions/node_modules/     安装后的插件
├─ extensions/apis/             接口源、连接定义（Internal为组织资料）
├─ tools/                       管理器、诊断和维护工具
├─ offline-api-tool/            Internal本地接口文档
├─ data/config/                 启动自动初始化的模型/RAG等配置
├─ data/dsh/profiles/web/        用户profile及覆盖补丁
├─ data/runtime/                临时运行文件，可能含认证材料
└─ workspace/                   工作文件与AGENTS.md规则
```

核心升级边界：定制放在 launcher 和扩展层，core 保持原始散列；升级内核后重新检查原生库、插件声明和profile兼容性，不能只换版本字符串。

## 4. 界面和启动链路

```text
start.sh / start.cmd
  → launcher/supervisor.cjs
  → launcher/bootstrap.cjs
  → 校验插件状态、初始化Internal默认配置、生成运行时profile
  → 随包Node运行 dsh web --no-open
  → Electron加载本机认证页面
  → 插件贡献设置页、工具、知识检索和业务功能
```

主窗口与业务浏览器是两个用途：主窗口显示聊天/设置；业务浏览器由 Playwright 插件按需启动，用于用户登录业务系统。当前没有接入外部中广核浏览器。

配置按层合并：内核默认 → 部署覆盖 → 用户profile补丁。用户层应保留最终覆盖优先权。删除某项覆盖不代表禁用内置插件；需要明确 disabled，避免旧默认值回落。模型解密和提供者配置由启动适配完成，不把密钥写进Git。

Internal 默认配置首次启动复制到 data/config；已有用户文件不会被默认配置覆盖。这里的“固定”是预置服务配置，仍需能访问组织服务，并非将运行时文件锁定为只读。钉钉绑定和组织账号登录不属于可直接复用的固定模型/RAG配置。

## 5. 安装与首次验收

### 5.1 内网麒麟：无需迁移、无需配置模型/RAG

将匹配的 Internal Core、Internal Plugins 和合并脚本放在同一目录。普通用户执行：

```sh
sh 合并安装R11.4.sh "/data/内网小智R11.4"
sh "/data/内网小智R11.4/Neiwang-Xiaozhi-Kylin-ARM64-R11.4/start.sh"
```

目标目录必须不存在；两份 tar.gz 在麒麟端解压，保留权限和符号链接。不要用Windows展开目录逐文件拷贝。详细步骤见 [内网安装说明](INTERNAL_INSTALL.md)。

### 5.2 Windows / 公开包

Public 包不带组织模型/RAG配置。两份同版本ZIP解压到同一父目录后，在APP根目录执行：

```powershell
& .\runtime\node\node.exe .\plugin-pack\install.cjs
& .\配置模型.cmd
& .\配置RAG.cmd
& .\start.cmd
```

RAG仅在需要知识库时配置；公开包完整解压命令见 [安装说明](R11_4_INSTALL.md)。以上配置步骤不适用于已经预置的 Internal 交付版。

### 5.3 现场验收顺序

1. 核对两包版本、平台、类型和SHA256，确认Core及Plugins各小于500MB。
2. 启动主窗口，确认标题“内网小智”、首页“你说我做”、无左上角编辑菜单。
3. 向模型发普通测试问题；单独验证RAG检索，检查回答引用来源。
4. 在业务浏览器亲自登录，先测试只读页面和登记的只读接口。
5. 配置组织批准的钉钉机器人并绑定管理员；测试消息需要操作者明确授权。
6. 验证定时任务、插件列表和重启后的持久状态。关闭/休眠/关机不执行定时任务，不承诺补投递。

验收默认不修改真实表格、不提交审批、不自动发送测试消息。涉及真实业务写入时，先确定目标、范围和授权。

## 6. 常见故障与定位顺序

| 现象 | 优先检查 | 处理边界 |
|---|---|---|
| 麒麟窗口不启动 | 平台架构、Electron动态库、沙箱环境、启动错误文件 | 使用ldd定位；不默认加--no-sandbox绕过 |
| 界面重新连接 | 后台是否退出、端口占用、本机认证、浏览器控制台 | 不照搬旧版polyfill补丁进内核 |
| 模型不能回答 | 内网模型服务可达性、模型名称、配置完整性 | 不在聊天/日志贴密钥 |
| RAG未配置或无结果 | dify.enc是否初始化、RAG开关、服务地址可达、检索错误 | 失败/空结果不能作为知识证据 |
| 接口源列表为空 | 是否装Plugins、extensions/apis、是否误用Public包 | Public没有真实组织接口源是预期 |
| 钉钉Stream重连 | DNS、HTTPS/WSS可达、代理、组织网关、凭据验证 | 客户端消息同步不等于机器人API可达 |
| 浏览器业务登录失败 | 证书、代理、SSO、客户端证书、专用组件要求 | 目前尚无组织现场兼容验收 |
| 插件更新中断 | 事务状态、磁盘空间、用户修改冲突 | 先recover，不直接删锁或覆盖插件 |

已知诊断证据：用户麒麟报告中钉钉多个平台域名DNS返回 ENOTFOUND，获取token与Stream连接均失败。这说明当时网络解析链路失败，不能据此判断机器人密钥错误；需组织网络人员提供允许的解析/代理/API通路。报告本身和账号标识不上传公开仓库。

常用只读检查（APP根目录）：

```sh
uname -m
./runtime/node/bin/node --version
ldd launcher/electron/electron
ss -lnt
# 留意以下文件可能包含内部信息，提交前脱敏
ls data/config
```

不要把带token的启动URL、原始日志、Cookie、profile凭据或运行时认证文件发到GitHub。

## 7. 定制能力与实际边界

- 品牌：主标题32px、副标题18px，首页隐藏“预览版”；PDF内容预览功能保留。
- 提示词：SDK参数按需发现，保留安全上下文；Windows测试系统字符50169→8896，ARM64为48959→8655；不是精确token测量。
- RAG：遵守开关，同聊天复用已有材料，知识正文视为参考数据；模型配置和RAG配置独立。
- Playwright：页面快照、iframe、填写、点击、滚动、拖拽、截图；密码由本人输入；未提供任意JS/Cookie导出工具。登记只读接口的会话桥接仅在工具内部使用。
- AI表格：插件具备读写命令，组织授权另行管理；写入先预览。旧工作区规则仍残留只读说明，需要清理，不能将其描述为统一权限策略已经完成。
- 审批：内核具备ask审批、记录与失败拒绝；钉钉审批校验绑定管理员。浏览器/表格confirmed参数仍由调用方提供，尚未统一到不可绕过的真人审批。
- 技能孵化器/PDF/OCR：离线资源随插件包；原生麒麟OCR尚未完成现场验收。

## 8. 后续插件安装、升级与回退

关闭APP，在APP根目录用原用户执行：

```sh
sh 管理插件.sh check "/离线插件包目录"
sh 管理插件.sh install "/离线插件包目录"
sh 管理插件.sh list
# 更新失败或中断
sh 管理插件.sh recover
# 必要时回退最近一次插件事务
sh 管理插件.sh rollback
```

原配 plugin-pack 安装器用于首次初始化；增量包必须使用 plugin-package.json 格式，声明平台/内核兼容性和依赖。不能直接将初始Core/Plugins包当作增量插件包。

管理器更新插件与登记信息，不替换模型、RAG、绑定、workspace或core。后续插件自己的业务数据迁移需要独立兼容方案，代码回退不会撤销外部业务请求。详见 [离线插件机制](OFFLINE_PLUGIN_MANAGER.md)。

## 9. 测试证据与尚未完成的工作

| 验证 | 结果与证据 |
|---|---|
| Windows单测 | 41通过、3平台/权限相关跳过、0失败 |
| ARM64隔离环境单测 | 44通过、0失败 |
| 两平台Host/Agent、浏览器 | 合成本机夹具通过，含密码隐藏、iframe和会话桥接 |
| PDF/技能/定时任务 | Agent工具调用及冷启动恢复测试通过；Windows OCR通过 |
| 打包完整性 | Core散列不变、两包成员分离、插件散列与大小检查通过 |
| 隐私边界 | Public对比当前私有配置检查通过，Internal单独交付 |

原始公开汇总见 [R11.4验证记录](../manifests/r114-validation.json)。本地临时outputs是调查材料，不提交Git。当前文档更新不会重新构建Release，已发布安装包与后续main源码可能有差异。

接手优先级：

1. 将浏览器、表格等业务写入接入统一真人审批，校验管理员身份、单次目标和过期状态；不能由模型自行confirmed=true代替。
2. 清理工作区AGENTS.md里只读表格/移除浏览器等旧规则，与当前插件能力一致。
3. 在实体麒麟验证Electron沙箱/系统库、中文OCR、模型/RAG网络、组织SSO和客户端证书。
4. 收集业务浏览器现场错误再适配；若改接中广核浏览器，先确认Chromium/CDP与组织策略，当前未实现。
5. 新内核升级在独立目录回归，保留现用Internal和完整旧data备份；不要直接覆盖在用目录。

## 10. 构建、公开发布及隐私边界

以下为开发者构建细节；源码仓库不包含全部平台运行时材料。纯离线重建前需单独准备已审核基线、平台原生依赖和组织私有输入。新接手同事不能仅克隆仓库就假定能立即完整重建安装包。

### 10.1 构建与私有输入

`scripts/build-r114-release.py` 从已校验的 R11.3 麒麟 Public 基线和现有 Windows 基线复制到全新目录，保留官方内核文件，组合当前源码中的 PDF/OCR、技能、浏览器、提示词精简、品牌、插件管理和迁移工具。第三方版本/许可证见各扩展的 package.json、lock、upstream.json 和 LICENSE。

```sh
python scripts/build-r114-release.py \
  --linux-baseline /材料/已审核麒麟Public基线.tar.gz \
  --windows-baseline /材料/Windows基线APP \
  --private-source /本机当前APP \
  --private-docs /本机本地接口文档目录 \
  --private-sources /已审核的接口源材料目录 \
  --work /全新构建目录 \
  --dist /全新交付目录 \
  --node /Node24可执行文件
```

构建前先用随包官方DWS CLI执行 `node scripts/generate_dws_contracts.mjs /平台/DWS可执行文件 extensions/@neiwang/dws-aitable/contracts.json`，确保生成27项完整命令Schema；该步骤只读取本地Schema。

三个私有输入只在组织内保管，不入 Git。构建不执行接口文档中的代码，不请求模型、RAG、钉钉或业务系统；只在内存中解密当前模型/RAG并按新安装密钥重新加密到 Internal 的 defaults。Windows 机器人绑定不作为麒麟的默认绑定，避免两个实例抢同一机器人；实际旧麒麟绑定通过原机迁移保留。

构建输出分离为：

```text
构建目录/
├─ Public/Neiwang-Xiaozhi-Kylin-ARM64-R11.4/
├─ Public/Neiwang-Xiaozhi-Win10-x64-R11.4/
└─ Internal/Neiwang-Xiaozhi-Kylin-ARM64-R11.4/
交付目录/
├─ GitHub/              两平台四个Public拆分包
└─ Send-to-Intranet/    仅供组织内传递的麒麟Internal两包
```

内网钉钉仅允许上传500MB以内文件，因此每个平台拆分 Core/Plugins。两包各含互不重叠的同一根目录成员，解压到同一个新父目录后执行插件安装器。不得拼接压缩字节流。命令及旧配置迁移见 [安装说明](R11_4_INSTALL.md)。初始组合包安装器仍按发行版本匹配；后续插件维护使用独立事务管理器。

### 10.2 验证与发布

- `scripts/verify-r114-release.py`：检查每包小于500,000,000字节、两个包成员无重叠、插件散列、原内核散列、平台原生canvas、shell LF、版本与私有路径边界。
- `scripts/audit-public-release.cjs`：在公开构建中检查当前组织模型/RAG密钥和旧共享加密密钥未残留，仅报告状态和数量，不输出密钥。
- `scripts/test-settings-migration.cjs`：新旧密钥转换、模型/RAG/绑定和本地资料保留、重复迁移、已有文件保护、损坏配置与运行进程阻止。
- 原插件管理/浏览器回归、真实 Host/Agent、本机合成浏览器/Python会话桥接与 PDF/技能测试继续用于对应平台验收。测试仅访问本机夹具，不写真实表格、不发消息。

具体执行结果以 `manifests/r114-validation.json` 和 GitHub Release 描述为准。原生麒麟桌面、沙箱、证书和组织SSO需现场验收；已有ARM64模拟器OCR/WASM异常不能描述成原生麒麟OCR已验收。

先完成公开资产校验与隐私检查，再提交中文 commit，经 PR 和自动检查合并后创建 R11.4 Release。仅上传 GitHub/ 内的四个 Public Core/Plugins 包，SHA256写入 Release 描述，不附加 Internal、日志、凭据或原始业务资料。普通 GitHub 自动生成的源码归档不由安装包构建器控制。

配置迁移不覆盖旧目录；保留新目录已修改配置，与发行散列一致、尚未修改的默认模型/RAG和资料模板可由旧配置替换。发布后回退可继续使用未改动的旧APP；不要让新旧实例同时连接同一个钉钉机器人。


## 11. 交付文件与接手清单

| 文件 | 约大小（十进制MB） | 用途 |
|---|---:|---|
| Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Core.tar.gz | 380 | GitHub公开麒麟核心包 |
| Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Public-Plugins.tar.gz | 209 | GitHub公开麒麟插件包 |
| Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Core.zip | 364 | GitHub公开Windows核心包 |
| Neiwang-Xiaozhi-Win10-x64-R11.4-Public-Plugins.zip | 216 | GitHub公开Windows插件包 |
| Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Internal-Core.tar.gz | 380 | 组织内固定配置核心包，禁止公开上传 |
| Neiwang-Xiaozhi-Kylin-ARM64-R11.4-Internal-Plugins.tar.gz | 209 | 组织内接口资料和插件，禁止公开上传 |
| 合并安装R11.4.sh | 小型脚本 | 内网麒麟合并安装，不做迁移 |
| 安装与合并说明.md / R11_4_HANDOVER.md | 文档 | 发给部署和开发同事 |

工作目录约定（相对构建工作区根）：`collaboration/neiwang-xiaozhi` 为源码，`builds/R11.4-Release` 为平台构建副本，`dist/R11.4/GitHub` 为公开资产，`dist/R11.4/Send-to-Intranet` 为实际内网交付目录。这些大目录和私有文件不是Git源码内容。Linux安装以tar.gz为准，Windows上的展开目录不能替代符号链接正确的归档。

接手时确认取得：Git仓库与指定提交、两平台审核基线、构建Node/Python、离线依赖及许可证、组织私有输入（内部渠道）、本版SHA256清单、实体机验收记录。不要把历史工具目录和临时输出当成必备平台材料。

## 12. 提交与后续维护约定

所有新commit标题、正文用中文。从main创建功能分支，经PR和CI合并；禁止提交密钥、用户配置、绑定、日志、业务数据、真实接口文档、Internal安装包和node_modules。README与本交接文档跟随源码变化更新，不能把待办写成已实现。

本次交接文档及内网合并脚本属于R11.4发布后的源码维护；没有重打包已有Release资产。通用安装脚本和公开说明可提交GitHub，组织实际配置仍仅存在本地Internal包。日后重新构建时由构建脚本将最新版专用安装说明、合并脚本和交接文档放入内网交付目录。
