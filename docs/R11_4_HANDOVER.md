# R11.4 发布交接

当前发行：麒麟 ARM64、Windows 10/11 x64；内核继续使用 DSH 0.2.0-rc.2。当前开发模板为 R11.4-dev。`release-source/kylin-r11.3` 只作为历史快照，旧版构建脚本保留用于追溯，不表示本次应用仍是旧版本。

## 构建与私有输入

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

## 验证与发布

- `scripts/verify-r114-release.py`：检查每包小于500,000,000字节、两个包成员无重叠、插件散列、原内核散列、平台原生canvas、shell LF、版本与私有路径边界。
- `scripts/audit-public-release.cjs`：在公开构建中检查当前组织模型/RAG密钥和旧共享加密密钥未残留，仅报告状态和数量，不输出密钥。
- `scripts/test-settings-migration.cjs`：新旧密钥转换、模型/RAG/绑定和本地资料保留、重复迁移、已有文件保护、损坏配置与运行进程阻止。
- 原插件管理/浏览器回归、真实 Host/Agent、本机合成浏览器/Python会话桥接与 PDF/技能测试继续用于对应平台验收。测试仅访问本机夹具，不写真实表格、不发消息。

具体执行结果以 `manifests/r114-validation.json` 和 GitHub Release 描述为准。原生麒麟桌面、沙箱、证书和组织SSO需现场验收；已有ARM64模拟器OCR/WASM异常不能描述成原生麒麟OCR已验收。

先完成公开资产校验与隐私检查，再提交中文 commit，经 PR 和自动检查合并后创建 R11.4 Release。仅上传 GitHub/ 内的四个 Public Core/Plugins 包，SHA256写入 Release 描述，不附加 Internal、日志、凭据或原始业务资料。普通 GitHub 自动生成的源码归档不由安装包构建器控制。

配置迁移不覆盖旧目录；保留新目录已修改配置，与发行散列一致、尚未修改的默认模型/RAG和资料模板可由旧配置替换。发布后回退可继续使用未改动的旧APP；不要让新旧实例同时连接同一个钉钉机器人。

## 最新交付约定与待办（2026-10-24）

- 内网 Internal 版按固定配置交付：模型、RAG、本地接口文档和接口源随包内置；新电脑无需旧APP、迁移或首次配置。启动层自动初始化默认配置，详见 [内网安装说明](INTERNAL_INSTALL.md)。迁移工具仅保留为可选维护工具，不是内网安装步骤。
- 钉钉绑定与授权仍由本人完成，不把Windows机器人的绑定预置到麒麟。
- 当前Playwright控制的是随包Electron业务浏览器；用户接受继续使用Electron。连接本机中广核浏览器尚未实现，内网系统的证书、代理和SSO兼容问题仍待现场报错确认，不能宣称已经解决。
- 审批服务已存在，但浏览器与AI表格的 confirmed 参数不等于真人批准；统一强制人工审批尚未完成。桌面规则中还残留AI表格只读/业务浏览器已移除的历史描述，需要与当前实际能力统一。
- 本节及内网专用安装说明随源码维护；公开仓库只保存通用说明和构建脚本，不保存实际配置、密钥、内部接口资料或 Internal 安装包。
