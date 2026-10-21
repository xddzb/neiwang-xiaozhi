# 开发、维护与验证说明

## 结构与职责

官方内核固定于 core/<version>，不直接修改；自有插件在源码 extensions/<scope>/<name>，构建后放入 extensions/node_modules；桌面启动、会话存储和 UI 稳定性适配在 launcher；用户数据在 data 与 workspace。早期 Python harness/工作台已删除，tools 下的 Python 是当前执行/打包能力的一部分。

extensions 负责注册 Agent 工具、设置页、参数与授权处理；tools 是实际执行脚本。典型链路为用户指令 → 插件 → 执行程序 → 结果；AI 表格插件也会直接调用 extensions/dws 中的官方 CLI。

## 当前默认完整开发构建

- Node 24.x（至少 24.9.0）、DSH 0.2.0-rc.2、Electron 33.2.0。
- 官方钉钉 dsh-dingtalk 0.10.2，以及本机配置、绑定设置页。
- 官方 DWS CLI 1.0.65、AI 表格设置和工具。contracts.json 在构建时由固定 CLI 的本机 Schema 生成，不含真实企业接口。
- Python 3.12.14 独立发行包、PyInstaller 6.22.3 和锁定的 wheel 依赖；Linux 另含 bubblewrap 0.4.0-1ubuntu4.1、版权和对应源代码。
- 空白接口文档模板。真实接口和企业业务实现继续排除出仓库。

npm 依赖由 package-lock.json 固定。Python/DWS/沙箱的来源、文件名和 SHA256 固定于 manifests/dev-runtime-assets.json。下载后校验再解压，不从构建者系统 Python 复制整个环境。源码检查、构建和分发打包都会核对空白模板哈希；真实接口应复制到被忽略的文档后填写。

模型配置、钉钉和 DWS 登录状态只在本机保存。模型页保持可编辑，无密钥也能启动。环境变量仅作为显式高级默认值；用户 profile 最后加载。接口与模型配置的准确目录、完整命令见 [构建运行指南](BUILD_AND_RUN.md)。

## 验证方法

```sh
npm run check
npm test
npm run test:runtime
npm run verify:app -- builds/<完整开发APP目录>
```

verify:app 不只是检查文件：它实际执行 Python 脚本、打包并运行 PyInstaller 产物、拒绝覆盖已有输出、运行官方 DWS Schema/mock，随后在可丢弃组合目录中启动真实 DSH Agent，调用 Python/PyInstaller/DWS 工具，并验证钉钉一次性绑定。没有使用真实模型或组织账号，不发送真实表格写入和机器人消息。

源码 CI 运行轻量语法/排除、启动配置和归档边界测试。完整平台自检由构建者在目标环境执行，不将真实密钥放入 CI。

## 平台验证记录

- Windows 维护机：干净 npm ci（635 包）、官方资产 SHA256 校验、完整开发 APP 构建、Python/PyInstaller/DWS 自检、真实 Agent 工具链及隔离绑定通过。隐藏窗口中模型、钉钉、AI 表格设置页可打开，模型合成凭据可保存，原生菜单为空。
- Ubuntu 20.04 ARM64 / QEMU：干净 npm ci（640 包）、完整 Linux ARM64 构建和独立自检通过。补入受限 bubblewrap 后，真实 Agent 的 Python、PyInstaller、DWS 和隔离绑定链路通过；该缺失依赖已纳入新运行材料和构建默认路径。
- npm 的 Electron 二进制下载未完成时，使用已有同平台 33.2.0 完整目录；这条离线材料路径也写入指南。其余独立运行材料来自公开固定资产并校验。
- 没有把 Ubuntu 模拟环境当作麒麟实机，也没有完成 Windows 10 每个补丁版本的实机验收。麒麟需进一步验证系统库、用户命名空间和图形桌面；真实模型、Stream 消息及 AI 表格组织读写由使用者用自己的账号验收。

## 界面维护

原生菜单和持久会话由 launcher/shell/main.js 管理；布局边界样式在 launcher/shell/layout.css，通过品牌扩展注入。样式中的 frame 选择器对应固定内核 0.2.0-rc.2，内核升级时必须重新核对并测试。没有修改内核 npm 文件。

静置采样未发现持续几何抖动，不据此声称用户现场问题已彻底解决。详情见 [界面排查](UI_TROUBLESHOOTING.md)。

## 历史发行脚本

build_modular_r10.py 等保留用于历史离线核心/插件拆包，仍依赖干净 R9 基线及历史材料。当前从 GitHub 构建使用 build-dev.cjs，不要求 R9 基线。不要在生产 APP 上运行历史破坏性夹具，也不要将包含 data、聊天、真实接口和登录状态的目录作为发布材料。
