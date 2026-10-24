# R11.3 麒麟 ARM64 分包安装

同一版本、同一类型（Internal 或 Public）的 Core 和 Plugins 两包配套使用。

- Core：应用内核、Node/Python/Electron 运行环境、启动器及基础配置。
- Plugins：完整 `plugin-pack/`，含插件安装器、依赖、离线 OCR 数据和插件清单。

不要覆盖旧安装目录。把两份压缩包放在同一个新目录，依次解压；两包会合并到同一个 `Neiwang-Xiaozhi-Kylin-ARM64-R11.3` 根目录。不要分别解压到两个不同文件夹。

公开版示例：

```sh
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.3-Public-Core.tar.gz
tar -xzf Neiwang-Xiaozhi-Kylin-ARM64-R11.3-Public-Plugins.tar.gz
cd Neiwang-Xiaozhi-Kylin-ARM64-R11.3
sh plugin-pack/安装插件.sh
sh 配置模型.sh
# 使用 Dify 时另执行：sh 配置RAG.sh
sh start.sh
```

内网版把文件名中的 Public 换成 Internal。内网版保留原有模型与 RAG 默认配置，通常无需执行配置模型步骤。两类安装包不要混用。公开版不含组织凭据。

插件包包含定时任务配套能力、技能孵化器、离线 PDF/中英文 OCR，以及原有钉钉机器人和 AI 表格插件。需要完整功能时先安装插件再启动。定时任务要求 APP 保持运行；钉钉仍需组织允许的连接通道。

分包仅改变分发形式，不修改已验证的程序内容。`*-split-validation.json` 验证两包合并后的每个成员、权限、链接及文件 SHA256 与原完整安装包一致。原 ARM64 测试范围与限制见 `validation.json` 和交接文档。
