# 内网小智

内网小智的协作源码仓库。当前主线为 R10：官方 DeepSeek Harness 内核、部署配置、自有扩展和用户数据分离；Windows x64 / 麒麟 ARM64 交付采用 Core 核心包与 Plugins 可选插件包。

## 源码目录

| 目录 | 用途 |
| --- | --- |
| `launcher/` | 桌面启动、内核运行环境、Electron 壳与品牌资源 |
| `extensions/` | 独立部署、品牌、工具目录、钉钉设置/绑定、DWS AI 表格适配源码 |
| `tools/` | 钉钉配置、DWS 登录、Python/PyInstaller、文档处理入口 |
| `config/` | 无凭据的部署模板 |
| `scripts/` | R10 核心/插件拆包、文档嵌入、完整性验证及历史适配脚本 |
| `docs/` | 安装说明、更新说明及开发指引 |

钉钉使用官方 `DingTalk-Real-AI/dsh-dingtalk` 0.10.2，源码在本仓库保留的是配置页面和集成层。DWS AI 表格调用官方 DWS CLI；PyInstaller 用于将授权的 Python 脚本打包。业务浏览器已移除。

## 开发与验证

先阅读 [开发说明](docs/DEVELOPMENT.md) 和 [协作约定](CONTRIBUTING.md)。运行源码检查：

```sh
python scripts/check_source.py
```

本仓库不包含官方内核依赖、Electron/Node/Python 平台运行库、安装包、真实业务接口实现和接口文档。现有 R10 打包脚本依赖已准备好的 R9 基线及离线依赖，因此首次克隆不能直接产出完整安装包。构建前提与待完善项见开发说明；不能将本仓库当作现有发布包的无差别备份。

所有模型密钥、钉钉凭据、绑定信息、DWS 登录状态和聊天数据仅在本机配置。不要提交这些数据，即使仓库之后改为私有。配置示例见 `.env.example`；该文件不含真实值。

## 接口文档与模型密钥在哪里

- **内网接口文档**：由维护者通过企业内部受控渠道另行提供。原开发工程中的位置是 `offline-api-tool/内网接口文档.html`，该目录及文档不在 GitHub 仓库内；克隆仓库后找不到此文件是正常的。它不是 APP 安装目录中的默认文件。
- **已交付 R10 APP 的模型配置**：位于 APP 安装根目录的 `data/config/model.enc`。这是包含模型地址、模型名及 API Key 的本机加密配置，不要上传、发给同事或直接作为文本编辑。`config/defaults/model.enc` 如存在，是首次初始化使用的配置种子，也不能提交。
- **本仓库开发版的模型配置**：在启动进程的环境变量中设置 `NEIWANG_MODEL_KEY`、`NEIWANG_MODEL_URL`、`NEIWANG_MODEL_ID`。字段模板在 `.env.example`，启动器不会自动加载 `.env`。具体读取顺序见 [开发说明](docs/DEVELOPMENT.md#模型密钥的配置位置)。

第三方组件保留其原有许可证。此仓库尚未为项目自有代码指定开源许可证；上传源码不代表授予第三方组件以外的额外许可。
