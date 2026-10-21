# 从 GitHub 源码生成完整开发版 APP

## 构建内容与目录

默认构建包含：官方 DSH 内核与可修改的模型设置、桌面界面、钉钉官方连接器及绑定设置、DWS AI 表格、独立 Python 3.12.14、PyInstaller 6.22.3，以及空白接口文档模板。Linux 版另含固定版本 bubblewrap 沙箱助手及许可证/对应源码。默认不包含真实接口、企业专用业务实现、真实凭据、Office/OCR 大型依赖。这里的“完整开发版”指上述能力全部可用，企业业务仍需另行开发和授权。

构建产物是可移动的 APP 文件夹；Windows 通过 start.cmd 启动，麒麟通过 start.sh 启动，不是带系统安装向导的 MSI/DEB。Node、Electron、Python 和 DWS 随包携带，接收同平台 APP 的同事不必另装 Node/Python。模型推理和钉钉/DWS 远端业务仍需有效账号和网络。

## 一、构建前提

- Windows 10/11 x64：建议先进入较短路径（如 C:/dev）再克隆源码。安装 Git、Node.js **24.x（至少 24.9.0）**、用于准备构建材料的 Python **3.10+**。这个系统 Python 仅用于准备/打包，APP 将使用单独下载的 Python，不复制你的系统环境。
- 麒麟：在目标架构的麒麟桌面电脑上安装 Git、相同版本 Node/npm 和 Python 3.10+，以及 binutils（strip、objdump 等）。Linux 内核及企业安全策略必须允许所需的非特权用户命名空间；内置 bubblewrap 不会绕过系统策略。使用发行版的软件管理工具准备 Electron 所需图形/系统库。ARM64 用 ARM64 Node，x64 用 x64 Node；不支持在 Windows 上交叉编译麒麟版。
- 首次准备需要访问官方 npm、GitHub 发布资产和 PyPI。企业代理在本机配置，不提交代理凭据，不关闭 TLS 验证。
- 麒麟必须有图形桌面和可用的 Chromium 沙箱环境；本项目不自动修改系统沙箱策略。若 Electron 提示缺库，可执行 `ldd launcher/electron/electron` 检查，再由系统管理员补齐。不要使用 --no-sandbox 掩盖系统配置问题。

检查 `node --version`、`npm --version`、`python --version`（Linux 为 python3）。Windows PowerShell 若限制 npm.ps1，直接使用下方 npm.cmd；无需关闭脚本安全策略。

## 二、Windows：从下载源码到运行

在 PowerShell 中执行：

```powershell
git clone https://github.com/xddzb/neiwang-xiaozhi.git
cd neiwang-xiaozhi
npm.cmd ci
npm.cmd run prepare:runtime
npm.cmd run build
npm.cmd run verify:app -- builds/Neiwang-Xiaozhi-Win10-x64-Dev
npm.cmd start
```

也可从 GitHub Code → Download ZIP，解压后进入含 package.json 的目录，从 npm ci 开始。

每一步成功后再执行下一步：

1. npm ci 根据 package-lock.json 安装内核、钉钉和 Electron。正常联网时不要加 --ignore-scripts，否则 Electron 不完整。
2. prepare:runtime 下载固定版本 Python、DWS 和 PyInstaller 依赖轮子（Linux 还准备 bubblewrap 及对应源码）；逐个校验 SHA256，再安装到 `build-materials/win32-x64/`。上游和校验值见 `manifests/dev-runtime-assets.json`。
3. build 生成 `builds/Neiwang-Xiaozhi-Win10-x64-Dev/`，默认启用全部上述插件，并从官方 DWS 本机命令生成参数 Schema。不读取账号或调用真实业务。
4. verify:app 使用合成脚本验证 Python 执行、PyInstaller 打包及运行产物、已有产物保护、DWS 本机 Schema/mock，以及真实 Agent 工具调用和隔离钉钉绑定。通过后应显示 PASS，不需要模型/钉钉账号。Agent 测试使用临时组合目录，不会把账户或测试状态写入待分发 APP。
5. npm start 打开默认目录的 APP；以后可以直接双击该目录的 start.cmd。

若系统 Python 不在 PATH，可先设置 `$env:NEIWANG_BUILD_PYTHON='D:/Python/python.exe'`，再运行 prepare:runtime。

## 三、麒麟：在对应架构本机执行

```sh
git clone https://github.com/xddzb/neiwang-xiaozhi.git
cd neiwang-xiaozhi
npm ci
npm run prepare:runtime
npm run build
# ARM64：
npm run verify:app -- builds/Neiwang-Xiaozhi-Linux-arm64-Dev
npm start
```

x64 的验证目录改为 `builds/Neiwang-Xiaozhi-Linux-x64-Dev`。也可用 `sh builds/Neiwang-Xiaozhi-Linux-arm64-Dev/start.sh` 启动 ARM64 版。

Linux 准备阶段默认调用 python3；如需指定系统解释器，先执行 `export NEIWANG_BUILD_PYTHON=/path/to/python3`。运行中的 APP 使用包内 Python，与该变量无关。

Windows 打包只生成 Windows 程序，麒麟 ARM64 打包只生成 Linux ARM64 程序；PyInstaller 不能跨操作系统/架构生成程序。不同麒麟版本的系统库仍需在目标机器验收。

## 四、首次配置模型、钉钉和 AI 表格

### 模型

首次启动若显示预览版说明，先点“继续”；模型引导可点“稍后配置”。进入“设置 → 模型”，填写服务商/自定义模型服务、地址、模型名和 API Key，保存并选择模型。没有密钥也能打开设置，之后可继续修改。

开发版凭据保存在 `<APP根目录>/data/dsh/.credentials.yaml`，用户设置在 `<APP根目录>/data/dsh/profiles/web/cordis.patch.yml`。这些属于本机私有材料，不提交、不打包。开发版不读取原发布版的 model.enc，不复制默认加密配置种子。

高级启动默认值可通过 `.env.example` 中三个 NEIWANG_MODEL_* 环境变量提供，但必须三个都设或全部不设；模板不会自动加载。环境凭据是只读输入，若想通过界面修改，请清除这三个环境变量再启动。

### 钉钉机器人

默认已包含官方 `@dingtalk-real-ai/dsh-dingtalk` 0.10.2。先在组织后台创建和发布应用机器人，启用 Stream、设置权限和可见范围；在 APP“设置 → 钉钉机器人”中打开配置向导并输入本机凭据。向导首次使用本机终端。之后在设置页生成绑定口令，私聊机器人绑定，再验证真实消息。

Linux 需有 x-terminal-emulator 或 xterm；没有图形终端时在 APP 目录手动执行 `sh 配置钉钉.sh`。没有组织应用或授权时，文件完整性通过不代表消息已经连通。

### DWS AI 表格

默认已包含官方 DWS CLI 1.0.65。当前 Agent 接口仅开放查询，新增、修改和删除已禁用。Windows 先在 APP 目录运行 `powershell -NoProfile -File tools/dws-readonly-app.ps1 -Mode Configure`，使用已核对权限的专用只读应用；再在“设置 → 钉钉AI表格”登录并刷新。凭据采用当前 Windows 用户加密保存在 data/config/dws-readonly-app.xml，授权状态在 data/dws-readonly/。麒麟目前只完成 CLI/Schema 与工具自检，专用应用的图形授权配置尚未适配，不能视为已完成真实表格接入。不要复用机器人密钥，也不要提交本机授权数据。

先做 Base/表/字段/记录查询，确认目标后再授权写入，并读回校验。工具默认对未确认写入执行 dry-run；超时或未知结果先查询，不自动重试写操作。本功能是 AI 表格，不是普通电子表格或宜搭。

### Python / PyInstaller

Agent 工具名为 local_python 和 python_package，工作区内的 .py 脚本通过包内解释器执行/打包。先验证脚本，再打包并运行产物；结果在工作区 python-dist。程序以当前用户权限运行，不是安全沙箱。不要执行来源未知的脚本，额外第三方库需明确审核后加入，不在 APP 启动时自动下载。

## 五、接口文档的准确位置

接口文档不在 tools，也不在 extensions。仓库中的结构是：

```text
neiwang-xiaozhi/
├── package.json
├── tools/                         执行程序源码
├── extensions/                    插件源码
├── private-docs/                  与上述目录平级
│   ├── README.md
│   ├── 内网接口文档.template.html   空白结构，可提交
│   └── 内网接口文档.html            复制模板后内部填写，不提交
├── build-materials/               本机准备的运行库，不提交
└── builds/                        本机生成的 APP，不提交
```

双击 template.html 可离线查看，按文档管理、认证、接口登记、参数、响应、幂等、写后校验和验收章节填写。先复制为 `内网接口文档.html` 再编辑；该文件受 .gitignore 保护。不要在模板原文件中填真实业务信息。

APP 也带同一空白模板，位于 `<APP根目录>/private-docs/内网接口文档.template.html`。原维护工程旧文档位置是其根目录的 `offline-api-tool/内网接口文档.html`，该真实文档没有上传。放入文档不会自动注册业务接口。

## 六、重新构建与打包分发

构建器拒绝覆盖已存在的目录；源码修改后使用新目录，避免损坏配置和聊天。默认完整构建：

```sh
npm run build -- --output builds/My-Full-Dev-App
npm run verify:app -- builds/My-Full-Dev-App
npm run package -- builds/My-Full-Dev-App
```

打包使用相同的构建解释器选择规则：Windows 默认 python，Linux 默认 python3，也可通过 NEIWANG_BUILD_PYTHON 指定。不要先启动再打包。验证工具的合成输出在仓库 tmp 下，不写入 APP 用户数据目录。

分发压缩包在 dist，Windows 为 ZIP，Linux 为 tar.gz。打包器拒绝含 data、workspace、凭据种子或真实内部接口材料的 APP。接收者完整解压后使用 start.cmd/start.sh，并配置自己的模型/组织。大小以实际生成结果为准；若超过钉钉文件上限，应使用内部文件服务或拆分传输。

`npm start` 只启动默认目录；自定义目录从其 start.cmd/start.sh 启动。不需要这些集成能力时，可显式使用 `npm run build -- --core-only --output builds/Core-Only`，该目录不是完整开发版，不能通过 verify:app 的完整能力检查。

## 七、受限网络与常见失败

### Electron 无法下载

索取同平台、同架构、版本 33.2.0 的经验证 Electron 完整目录（可使用干净旧 APP 的 launcher/electron，不复制整个 APP 或 data）。Windows PowerShell：

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD='1'
npm.cmd ci
Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD
npm.cmd run prepare:runtime
npm.cmd run build -- --electron-dist 'D:/offline-materials/electron-33.2.0-win32-x64'
```

Linux 用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`，随后给 build 传对应 --electron-dist。不能混用 Windows/ARM64/x64 的运行库。

### Python/DWS 下载失败

重试 prepare:runtime；下载在输出目录创建前完成。已下载缓存会重新校验，部分下载不会作为成功文件使用。也可由同事按资产清单下载全部当前平台文件，保留原文件名放到缓存，再执行：

```sh
npm run prepare:runtime -- --cache /path/to/verified-asset-cache
```

缓存目录应包含该平台 Python 归档、DWS 归档和列出的全部 wheel；Linux 还需 sandbox、sandbox_sources 中的 bubblewrap 包及源码文件。脚本仍会逐个核验 SHA256。若准备阶段解压/安装失败留下不完整 build-materials/<platform>，先将该目录移到一旁再重试；不要删除已运行 APP 的 data。

### 系统库、沙箱、权限或自检失败

不要分发不完整构建。检查平台/架构、Node 版本、Python 构建材料、binutils、Linux 沙箱策略及 Electron 系统库。Linux 中若系统禁止用户命名空间，Agent 的受限执行会明确失败；由管理员按组织策略处理，不自动退回无限制模式。verify:app 的失败夹具位于 tmp/verify-full-*。npm run check 做源码检查（Git 克隆和 Download ZIP 均支持），npm test 做启动配置测试，npm run test:runtime 做缓存完整性和归档边界测试。

## 八、验证范围

本仓库只记录实际验证结果，不将 Ubuntu ARM64 模拟环境等同于麒麟实机，也不将维护者 Windows 主机等同于所有 Windows 10 机器。平台结果及限制见 [开发说明](DEVELOPMENT.md)。模型真实推理、钉钉消息、DWS 组织授权和真实表格读写必须由使用者在自己的组织中验收。

## 九、界面与“编辑”菜单

开发版已移除原生“编辑”菜单，桌面缓存/界面偏好保存在 data/desktop 的持久会话中。界面稳定适配位于独立品牌扩展和 launcher/shell/layout.css，不修改官方内核文件。

维护者电脑上的 R9 快捷方式仍指向旧安装目录；源码更新不会自动替换用户已运行的进程。本次已对其桌面壳应用相同菜单和稳定性处理，需完全退出后重开。空闲左右晃动尚未在测试环境稳定复现，不能仅凭样式改动宣布现场问题已彻底解决；诊断及回退记录见 [界面排查](UI_TROUBLESHOOTING.md)。

### 系统 Python 版本较旧时

NEIWANG_BUILD_PYTHON 可以指向可移动的独立 Python，不要求替换系统 Python。可从资产清单取得当前平台的 Python 归档并核对 SHA256，在单独目录解压（Linux 归档顶层为 python/，可使用 tar 的 --strip-components=1），再将变量指向其中的 bin/python3。准备脚本随后仍会按清单校验和组装 APP 自己的运行库。这与本次 ARM64 验证中使用独立 Python 作为构建解释器的方式相同。
