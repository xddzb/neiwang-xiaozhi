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
- Electron、Node 和其他插件版本以经验证的发布基线为准；当前仓库尚无涵盖全部离线材料的可复现依赖锁文件，不要自行假定跨平台二进制可互换。

## 内网接口文档的位置

接口文档由维护者通过企业内部受控渠道另行分发。原开发工程中对应 `offline-api-tool/内网接口文档.html`；同目录的 `presets.json` 等业务定义也不入库。此处只记录路径，不包含接口正文、真实服务地址或认证信息。

GitHub 克隆目录不自带上述文件，也没有把文档放进 APP 默认安装目录。需要这些材料时向项目维护者申请，在本机独立保存；不要上传至 GitHub Issue、PR 或仓库附件。接口文档位置不等于模型配置位置。

## 模型密钥的配置位置

以下路径中的“APP 根目录”指解压后含 `launcher/`、`config/`、`data/` 的内网小智目录，而非 GitHub 源码目录。

| 使用方式 | 配置位置 | 说明 |
| --- | --- | --- |
| 已交付 R10 APP | `<APP根目录>/data/config/model.enc` | 本机模型地址、模型列表、默认模型和 API Key 的加密配置；用配套配置流程生成，不作为明文编辑 |
| 发布基线的首次初始化种子（如存在） | `<APP根目录>/config/defaults/model.enc` | 仅在用户配置不存在时复制；不是日常修改已有用户配置的位置，也不入库 |
| 本仓库开发版 | 启动进程环境变量 | `NEIWANG_MODEL_KEY`、`NEIWANG_MODEL_URL`、`NEIWANG_MODEL_ID`；`.env.example` 只列字段 |

本仓库的 `launcher/bootstrap.cjs` 优先读取非空 `NEIWANG_MODEL_KEY` 对应的环境配置；否则读取 `<NEIWANG_DATA_DIR>/config/model.enc`。未设置 `NEIWANG_DATA_DIR` 时使用 `<APP根目录>/data`。已有发布版和开发副本的启动逻辑有差异，不能只把源码启动器覆盖进已安装 APP。

开发副本使用环境变量 `NEIWANG_MODEL_KEY`、`NEIWANG_MODEL_URL`、`NEIWANG_MODEL_ID` 提供模型连接。`.env.example` 仅是字段说明，启动器不会自动读取 `.env`。必须通过启动环境设置；不应在终端记录、截图和提交中暴露值。

源码中的原固定解密常量已移除。如果需要兼容本机已有 `model.enc`，由本机安全配置提供 `NEIWANG_CONFIG_KEY`；不提交加密配置文件或解密密钥。生产配置迁移须单独测试。原已安装 APP 不受本仓库整理影响。

钉钉在本地完成应用创建、Stream 模式、凭据配置和管理员绑定；绑定口令由设置页生成。DWS 通过本机授权登录，先查询，再按明确授权写入并读回校验。登录凭据及接口文档不属于仓库材料。

## DWS Schema

AI 表格适配器所需 `contracts.json` 不入库。使用固定版本官方 DWS CLI，按 runner 中的命令清单运行 `dws schema --cli-path "aitable <command>" --compact --format json`，在本机聚合生成 contracts；参数来自官方 schema，不手写猜测。可使用 `node scripts/generate_dws_contracts.mjs <dws路径>`。生成文件只用于本地构建。

## 打包与测试

`scripts/build_modular_r10.py` 依赖 `builds/Neiwang-Xiaozhi-<platform>-R9` 已准备好的干净发布基线，以及 `downloads/` 下的平台材料。基线必须不含 data、用户工作区和凭据。原历史脚本中部分 R8/R9 路径用于迁移参考，不应直接在生产 APP 上执行。

现有集成脚本还需要发布包、浏览器/平台环境或 `TEST_APP_ROOT`，不会在源码 CI 中自动运行。尤其 `test_feature_install.py` 会修改测试副本文件以验证拒绝行为，必须使用可丢弃副本。

首次协作提交仅完成源码整理、语法/泄漏规则检查；没有重新构建或重新验证 Windows/麒麟安装包。后续应补齐受控基线获取、依赖锁定、构建流水线和各平台验收。
