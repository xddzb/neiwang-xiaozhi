# 内网小智

内网小智的协作源码仓库。当前开发主线为 R10-dev：官方 DeepSeek Harness 内核、部署配置、自有扩展和用户数据分离；Windows x64 / 麒麟 ARM64 交付采用 Core 核心包与 Plugins 可选插件包。

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

同事从 GitHub 下载后，请先按 [从源码生成并运行 APP](docs/BUILD_AND_RUN.md) 操作；该文档包含依赖安装、构建命令、模型配置、钉钉和分发打包步骤。另见 [开发说明](docs/DEVELOPMENT.md) 和 [协作约定](CONTRIBUTING.md)。运行源码检查：

```sh
python scripts/check_source.py
```

开发版通过 `npm ci` 下载锁定依赖、`npm run build` 生成桌面 APP、`npm start` 启动，不再要求本机 R9 基线或预先配置模型密钥。首次启动在设置 → 模型中填写自己的服务和 API Key，可继续修改。完整命令及平台前提见构建运行指南。历史 R10 离线核心/插件包的脚本仍需发行基线，与新开发构建不同。

## 接口文档与模型密钥在哪里

- **接口文档不在 tools 或 extensions 中**。原开发工程位置为工程根目录 `offline-api-tool/内网接口文档.html`，该目录未上传。合作开发统一将另行取得的内部文档放在克隆目录根部的 `private-docs/内网接口文档.html`，与 `tools/`、`extensions/` 平级，文档正文不入库，也不会自动启用业务接口。
- **开发版模型配置**：设置 → 模型。凭据保存在 `<APP根目录>/data/dsh/.credentials.yaml`，用户配置在 `<APP根目录>/data/dsh/profiles/web/cordis.patch.yml`。不提交这些文件。高级环境配置字段见 `.env.example`，但该模板不会自动加载。
- **原已交付 R10 发布版**仍使用 `<APP根目录>/data/config/model.enc`，与新开发版不同；不要把旧文件或启动器直接覆盖到开发版。

第三方组件保留其原有许可证。此仓库尚未为项目自有代码指定开源许可证；上传源码不代表授予第三方组件以外的额外许可。
