# 从 GitHub 源码生成并运行开发版 APP

## 1. 这次补齐的构建范围

开发版已恢复官方模型设置、账号配置和自动压缩入口；不要求预先提供 `model.enc`，不覆盖用户在设置页修改的模型。品牌定制继续位于扩展层。当前构建生成可直接启动的桌面 APP 文件夹，不生成系统安装向导，也不依赖维护者电脑上的 R9 基线。

默认包含官方内核、模型设置/对话、文件和命令工具、内置插件管理及品牌界面。可在构建时加上钉钉官方连接器与配置/绑定页面。DWS AI 表格及 Python/PyInstaller 的集成源码仍在仓库，但本开发构建没有自动打入 DWS 二进制、Python、Office/OCR 和企业业务实现，不能把它当作完整离线 R10 插件包。

## 2. 准备电脑

- Windows 10/11 x64：安装 Node.js **24.x，至少 24.9.0**（包含 npm）和 Git。需要生成分发压缩包时再安装 Python 3.10 或更新版本。
- 麒麟 ARM64：在目标麒麟电脑上安装相同 Node.js 24.x ARM64、npm 和 Git，准备桌面图形会话及 Electron 所需系统库。麒麟 x64 同理使用 x64 Node。**必须在对应操作系统和架构构建**，不能把 Windows 的 node_modules 直接拷到麒麟。
- 首次构建需联网访问 npm 注册表及 Electron 官方分发服务。生成后的内核和运行时随 APP 文件夹保存；模型、钉钉等远端能力仍需网络。企业网络代理应使用本机 npm/系统代理配置，不提交凭据，也不要关闭 TLS 证书验证。

确认 `node --version` 为 v24.x，`npm --version` 正常；Windows PowerShell 若限制 npm.ps1，可使用以下命令中的 `npm.cmd` 代替 `npm`，无需关闭系统脚本安全策略。

## 3. 下载、安装依赖、构建

```sh
git clone https://github.com/xddzb/neiwang-xiaozhi.git
cd neiwang-xiaozhi
npm ci
npm run build
npm start
```

也可以在 GitHub 选择 Code → Download ZIP，解压后进入含 `package.json` 的目录，从 `npm ci` 开始。`npm ci` 按 `package-lock.json` 安装依赖；不要加 `--ignore-scripts`，否则 Electron 运行时不会下载完整。安装失败时先解决网络/系统依赖，不能跳过错误继续构建。

默认输出目录：

- Windows：`builds/Neiwang-Xiaozhi-Win10-x64-Dev/`，以后双击其中的 `start.cmd`。
- 麒麟 ARM64：`builds/Neiwang-Xiaozhi-Linux-arm64-Dev/`，以后在图形会话中执行 `sh start.sh`。
- Linux x64：`builds/Neiwang-Xiaozhi-Linux-x64-Dev/`。

`npm start` 只启动默认输出目录。自定义目录用 `npm run build -- --output builds/My-Dev-App`，之后从该目录的 `start.cmd` 或 `start.sh` 启动。构建器拒绝覆盖已有目录，避免损坏用户数据；修改源码后应构建到新目录，不要在旧目录中盲目重装。

### 受限网络：已有 Electron 离线材料

如果 npm 注册表可达，但 Electron 下载服务不可达，可以向维护者索取同平台、同架构、版本 **33.2.0** 的经验证 Electron 目录（包含可执行文件、version、资源和许可证，不是仅一个 exe）。本机已有干净 APP 中的 `launcher/electron/` 也可作为来源，不要复制整个 APP 或其 data。

Windows PowerShell：

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD='1'
npm.cmd ci
Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD
npm.cmd run build -- --electron-dist 'D:/offline-materials/electron-33.2.0-win32-x64'
npm.cmd start
```

Linux 的安装步骤用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`，构建时传对应平台的 `--electron-dist`。此方式仍需 npm 依赖可用；不是完全断网的依赖获取方案。构建器检查 Electron 版本，材料来源及架构由提供者确认。

## 4. 配置模型和工作区

首次启动先进入 **设置 → 模型**，按页面选择服务商或新增自定义服务，填写模型服务地址、模型名和 API Key，保存并选择默认模型。模型凭据由官方凭据组件保存在 `<APP根目录>/data/dsh/.credentials.yaml`；用户设置保存在 `<APP根目录>/data/dsh/profiles/web/cordis.patch.yml`。这些都是本机私有文件，凭据文件不是本仓库原有 `model.enc` 加密格式。

模型设置可继续在界面修改。`config/overrides.json` 是可编辑的部署默认值；官方用户配置在其后加载。修改部署文件后重启 APP。开发版启动器不再读取或复制发布版的 `config/defaults/model.enc`，也不再强制存在 `data/config/model.enc`。

高级用户可通过启动环境设置 `.env.example` 中的三个 `NEIWANG_MODEL_*` 字段提供默认模型；必须三个都填或全部不设。环境变量中的密钥属于只读启动输入，可能让对应模型凭据在界面中表现为只读。若希望全程在界面修改，清除这三个环境变量再启动。`.env.example` 不会自动加载为配置。

首次使用选择一个本机可写工作区。先测试一条模型消息，再让 Agent 在测试目录创建文件。模型真实收发需使用自己的有效凭据，不属于自动构建验证。

## 5. 可选钉钉

```sh
npm run build -- --with-dingtalk --output builds/My-DingTalk-Dev
```

从新目录启动，进入设置中的“钉钉机器人”，打开配置向导。首次配置可能使用本机终端；已配置后可在页面生成绑定口令。应用创建、Stream 模式、权限和可见范围要在钉钉组织中另行完成。凭据只输入本机，绑定命令私聊机器人；不将凭据/绑定或会话打进分发包。

## 6. 生成发给同事的压缩包

**必须使用从未启动的新构建目录。** 示例（Windows）：

```sh
npm run build -- --output builds/Neiwang-Xiaozhi-Win10-x64-Dev-Share
npm run package -- builds/Neiwang-Xiaozhi-Win10-x64-Dev-Share
```

麒麟把示例目录名换成相应平台名称即可。压缩包生成在 `dist/`，Windows 为 ZIP，Linux 为 tar.gz。打包器遇到 `data/`、`workspace/` 或凭据种子目录会拒绝打包，防止传播用户数据。接收者完整解压后用 `start.cmd`/`start.sh` 启动，并配置自己的模型。此压缩包包含 Node 和 Electron，无需接收者另装 Node；使用远端能力仍需服务可达。

## 7. 接口文档放哪里

接口文档**不属于 tools 或 extensions**。这台维护电脑的原始工程将它放在工程根目录的 `offline-api-tool/内网接口文档.html`，`offline-api-tool` 与 `tools`、`extensions` 为平级目录，但没有上传到 GitHub。

同事的 GitHub 克隆目录没有该文件。通过内部渠道取得文档后，统一在本机放入仓库根目录的 `private-docs/内网接口文档.html`（已加入忽略规则）：

```text
neiwang-xiaozhi/
├── package.json
├── extensions/             插件源码
├── tools/                  执行程序源码
├── private-docs/
│   ├── README.md           仓库内的位置说明
│   └── 内网接口文档.html    本机内部材料，不入库
└── builds/                 本机生成的 APP，不入库
```

放入文档不会自动注册业务接口。企业业务实现、认证和权限须另行受控配置；仓库不包含接口正文或真实业务地址。

## 8. 验证边界

源码检查用 `npm run check`（需要 Python 和 Git）。开发构建流程与平台实测结果见开发说明。麒麟仍需在目标发行版验证系统库、沙箱和图形环境；不要使用 `--no-sandbox` 绕过系统配置问题。原 R10 核心/插件离线拆包脚本保留用于维护历史发行包，与这里的开发版构建入口分开使用。
