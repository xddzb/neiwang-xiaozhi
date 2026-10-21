# 开发与构建前提

## 当前整理范围

主线源码从 R10 提取，第三方 npm 内核不随仓库复制。业务专用适配包和具体接口说明尚未进入此仓库；工具目录可能显示对应入口，但需要由企业侧另行提供受控实现后才能执行这些业务。不要把缺少业务包的源码目录冒充完整交付包。

`legacy/` 保存早期 Python 实现供参考。R10 的桌面入口为 `launcher/supervisor.cjs`；`launcher/bootstrap.cjs` 组装内核、扩展和数据路径。部署后的扩展位于 `extensions/node_modules/<scope>/<name>`，本仓库将自有扩展放在 `extensions/<scope>/<name>`，构建时复制到该运行布局。

## 依赖基线

- DeepSeek Harness：`0.2.0-rc.2`，独立安装到 `core/<version>/node_modules`，保留上游许可证。
- 钉钉官方连接器：`@dingtalk-real-ai/dsh-dingtalk` `0.10.2`。
- DWS CLI：现有发布基线为 `1.0.65`，按目标平台提供官方二进制和许可证，放入 `extensions/dws/`。
- Python：现有发布基线 Windows 为 3.12，ARM64 为 3.11；PyInstaller 为 6.22.3。平台依赖必须分别准备。
- Electron、Node 和其他插件版本以经验证的发布基线为准；当前仓库尚无涵盖全部离线材料的可复现依赖锁文件，不要自行假定跨平台二进制可互换。

## 本机配置

开发副本使用环境变量 `NEIWANG_MODEL_KEY`、`NEIWANG_MODEL_URL`、`NEIWANG_MODEL_ID` 提供模型连接。`.env.example` 仅是字段说明，启动器不会自动读取 `.env`。必须通过启动环境设置；不应在终端记录、截图和提交中暴露值。

源码中的原固定解密常量已移除。如果需要兼容本机已有 `model.enc`，由本机安全配置提供 `NEIWANG_CONFIG_KEY`；不提交加密配置文件或解密密钥。生产配置迁移须单独测试。原已安装 APP 不受本仓库整理影响。

钉钉在本地完成应用创建、Stream 模式、凭据配置和管理员绑定；绑定口令由设置页生成。DWS 通过本机授权登录，先查询，再按明确授权写入并读回校验。登录凭据及接口文档不属于仓库材料。

## DWS Schema

AI 表格适配器所需 `contracts.json` 不入库。使用固定版本官方 DWS CLI，按 runner 中的命令清单运行 `dws schema --cli-path "aitable <command>" --compact --format json`，在本机聚合生成 contracts；参数来自官方 schema，不手写猜测。可使用 `node scripts/generate_dws_contracts.mjs <dws路径>`。生成文件只用于本地构建。

## 打包与测试

`scripts/build_modular_r10.py` 依赖 `builds/Neiwang-Xiaozhi-<platform>-R9` 已准备好的干净发布基线，以及 `downloads/` 下的平台材料。基线必须不含 data、用户工作区和凭据。原历史脚本中部分 R8/R9 路径用于迁移参考，不应直接在生产 APP 上执行。

现有集成脚本还需要发布包、浏览器/平台环境或 `TEST_APP_ROOT`，不会在源码 CI 中自动运行。尤其 `test_feature_install.py` 会修改测试副本文件以验证拒绝行为，必须使用可丢弃副本。

首次协作提交仅完成源码整理、语法/泄漏规则检查；没有重新构建或重新验证 Windows/麒麟安装包。后续应补齐受控基线获取、依赖锁定、构建流水线和各平台验收。
