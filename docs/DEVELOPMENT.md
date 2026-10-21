# 开发与构建前提

## 当前整理范围

主线源码从 R10 提取，第三方 npm 内核不随仓库复制。业务专用适配包和具体接口说明尚未进入此仓库；工具目录可能显示对应入口，但需要由企业侧另行提供受控实现后才能执行这些业务。不要把缺少业务包的源码目录冒充完整交付包。

早期 Python harness/工作台已从当前源码树删除。R10 的桌面入口为 `launcher/supervisor.cjs`；`launcher/bootstrap.cjs` 组装内核、扩展和数据路径。部署后的扩展位于 `extensions/node_modules/<scope>/<name>`，本仓库将自有扩展放在 `extensions/<scope>/<name>`，构建时复制到该运行布局。`tools/` 下的 Python 文档处理和 PyInstaller 入口仍为当前功能的一部分。

## 依赖基线

### extensions 与 tools 的分工

`extensions/` 是 Agent 与界面的插件层：包含插件清单、Cordis 注册、设置页、工具定义和请求处理，负责把能力接入内核。例如 `@deepseek-ai/neiwang-dingtalk-ui` 提供钉钉设置和绑定页面，`@neiwang/dws-aitable` 注册 AI 表格工具并校验参数、授权及结果。

`tools/` 是具体执行程序：例如 `configure-official-dingtalk.mjs` 执行本机配置流程，`dws-login.cjs` 启动 DWS 登录，`package_tool.py` 调用 PyInstaller。它们通常由插件或本机入口启动，不会仅因放在此目录就自动注册为 Agent 工具。

典型链路是“用户指令 → extensions 插件 → tools 执行程序 → 插件返回结果”。两者不要求一一对应：有些插件直接调用官方 CLI，例如 AI 表格的 runner 直接调用 `extensions/dws/` 中的 DWS 二进制。运行布局中的 `extensions/` 也承载可选依赖，不代表里面所有文件都是自有插件源码。

- DeepSeek Harness：`0.2.0-rc.2`，独立安装到 `core/<version>/node_modules`，保留上游许可证。
- 钉钉官方连接器：`@dingtalk-real-ai/dsh-dingtalk` `0.10.2`。
- DWS CLI：现有发布基线为 `1.0.65`，按目标平台提供官方二进制和许可证，放入 `extensions/dws/`。
- Python：现有发布基线 Windows 为 3.12，ARM64 为 3.11；PyInstaller 为 6.22.3。平台依赖必须分别准备。
- 开发构建使用 Node 24.x（至少 24.9.0）、Electron 33.2.0 和仓库中的 package-lock.json。锁文件固定 npm 依赖，但不涵盖历史完整离线版的 DWS/Python/Office 材料；平台二进制不能互换。

## 内网接口文档与模型配置

具体目录树、模型配置位置及从 GitHub 下载后的操作步骤统一见 [构建运行指南](BUILD_AND_RUN.md)，避免两份说明不一致。

接口文档是独立本机材料，开发约定位置为仓库根目录的 `private-docs/内网接口文档.html`，不在 `tools/` 或 `extensions/`。原维护工程的旧位置为 `offline-api-tool/内网接口文档.html`。文档正文及业务接口定义继续排除出仓库。

开发版恢复官方模型设置和凭据存储，不再要求加密 model.enc。`config/overrides.json` 不再禁用模型页、模型提供方及自动压缩；用户 profile 配置后加载，用户设置可覆盖部署默认值。只有品牌替换仍关闭官方品牌插件。

## DWS Schema

AI 表格适配器所需 `contracts.json` 不入库。使用固定版本官方 DWS CLI，按 runner 中的命令清单运行 `dws schema --cli-path "aitable <command>" --compact --format json`，在本机聚合生成 contracts；参数来自官方 schema，不手写猜测。可使用 `node scripts/generate_dws_contracts.mjs <dws路径>`。生成文件只用于本地构建。

## 历史离线 R10 打包脚本

`scripts/build_modular_r10.py` 依赖 `builds/Neiwang-Xiaozhi-<platform>-R9` 已准备好的干净发布基线，以及 `downloads/` 下的平台材料。基线必须不含 data、用户工作区和凭据。原历史脚本中部分 R8/R9 路径用于迁移参考，不应直接在生产 APP 上执行。

现有集成脚本还需要发布包、浏览器/平台环境或 `TEST_APP_ROOT`，不会在源码 CI 中自动运行。尤其 `test_feature_install.py` 会修改测试副本文件以验证拒绝行为，必须使用可丢弃副本。

新的开发构建入口为 `scripts/build-dev.cjs`，依赖由 package-lock.json 锁定，按构建主机平台生成 APP。Windows 和麒麟的目标系统验收仍需分别完成；不要把本机 Windows 测试等同于麒麟实机测试。

## 本次验证结果

在维护者 Windows 电脑使用 Node 24.9.0 完成锁文件依赖安装（635 个 npm 包），Electron 下载未完成，改用已验证的同平台 33.2.0 目录。已实际生成开发 APP 并打开模型设置页，以合成测试值验证本机凭据写入及下次初始化保留；未进行真实模型推理或钉钉消息收发。`npm test` 验证无密钥初始化、用户配置保留、不完整环境配置拒绝和完整环境默认模型。麒麟和 Windows 10 实机尚未验收，当前 Windows 主机的验证不代表所有目标系统兼容。

另已验证全新开发构建的 ZIP 打包及压缩包完整性（约 300 MB），包内无 data、workspace 或默认凭据种子；打包器对含测试用户状态的构建目录会拒绝打包。安装包本身不提交到 GitHub。
