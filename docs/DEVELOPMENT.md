# 内网小智 —— 开发、构建与插件维护

## 开发入口与版本

根目录是唯一当前开发源码。当前开发目标为应用R11.5 / DSH 0.2.1-rc.3；已发布R11.4使用0.2.0-rc.2。不要手工修改core依赖文件。全局APP规则模板在config/workspace-rules.md，源码协作规则在根目录AGENTS.md。

构建机可以联网准备依赖；内网安装阶段不执行npm/pip下载。使用随包Node24运行构建工具。

跨平台准备内核时，安装器可能按构建机平台跳过ARM64可选原生依赖。执行 `python scripts/prepare-core-platform.py <内核材料目录> --os linux --arch arm64`，按锁文件固定版本与完整性从npm官方源补齐，不执行依赖脚本。打包前检查必要原生模块；不能只以CLI显示版本作为兼容验收。

Public和Internal由同一源码分别构建。GitHub只允许Public，不含实际组织模型/RAG配置、密钥、接口源或接口文档；Internal的私有输入只保存在本机，预置后无需首次配置。`scripts/check-release-config.cjs`在打包前核对两种边界，失败停止构建；详细日志也不得输出敏感值。

```sh
npm ci
npm run prepare:plugins
# 只在首次设置本机材料路径时复制并编辑
cp config/build.example.json config/build.local.json
python scripts/build-release.py --check
python scripts/build-release.py
```

build.local.json被Git忽略，只填路径和公开基线SHA256，不把密钥写入JSON。privateApp统一指向已预配置的组织内APP；读取data/config或config/defaults、offline-api-tool及extensions/apis（或插件载荷对应目录）。无需人工导出三份私有输入。

Public基线只是已审核的完整平台材料归档；以SHA256锁定，保留运行时与资源。它不是历史源码，更不是新内核来源。新版官方内核在构建机提前准备好，作为独立材料组合；不能从互联网在目标内网补下载。

新内核材料目录由构建机按固定版本准备：

```sh
# 各目标平台准备独立目录；省略安装脚本，使用随包预编译原生库
npm install --prefix /材料/core-win32-x64 --ignore-scripts --os=win32 --cpu=x64 @deepseek-ai/dsh@0.2.1-rc.3 @dingtalk-real-ai/dsh-dingtalk@0.10.2
npm install --prefix /材料/core-linux-arm64 --ignore-scripts --os=linux --cpu=arm64 @deepseek-ai/dsh@0.2.1-rc.3 @dingtalk-real-ai/dsh-dingtalk@0.10.2
```

将两个目录写入本地清单的coreWindows/coreLinux。保留生成的package-lock.json供材料审计；原生模块仍需在对应平台验证，不能把Windows依赖目录冒充ARM64。

新平台包必须先检查DSH版本、原生模块OS/CPU、离线依赖、内核散列和每包大小。每次重建使用新输出目录，禁止覆盖在用APP。安装入口见[安装与使用](INSTALL.md)，架构、故障排查及历史验证见[详细交接](HANDOVER.md)。

## 独立插件维护

关闭APP，使用原用户在APP根目录执行（R11.4已内置管理器，无需旧版接入包）：

```sh
sh 管理插件.sh check "/离线插件包目录"
sh 管理插件.sh install "/离线插件包目录"
sh 管理插件.sh list
sh 管理插件.sh recover
sh 管理插件.sh rollback
```

同名插件更新必须提高版本；同版本不同内容拒绝覆盖。Core/Plugins是首次安装载荷，不能作为增量插件包。独立包用plugin-package.json声明内核和平台兼容性。旧内核插件不能因名字相同就直接搬到0.2.1-rc.3。

## 验证与提交

```sh
python scripts/check_source.py
npm test
python scripts/test_runtime_prepare.py
python scripts/test_build_release.py
node --test scripts/test-plugin-manager.cjs scripts/test-browser-patch.cjs
```

Host/Agent、浏览器、定时任务和平台归档测试在独立副本中进行，只使用本机合成服务，不调用组织模型、RAG、钉钉或表格写入。保留验证记录，但不上传原始日志或凭据。

提交标题与正文均用中文，从main创建功能分支，经PR和自动检查合并。修改语义化日志时区分源码更新、现场验收和安装包已发布三种状态。docs只保留HANDOVER.md、INSTALL.md、DEVELOPMENT.md三个入口。

## 私有材料边界

禁止提交build.local.json、组织服务地址、模型/RAG密钥、机器人绑定、用户profile、接口文档、业务数据、运行日志和Internal包。公开源码仅包含通用逻辑、空模板和锁定依赖元数据。Public发布前与组织私有值比对，仅输出通过/失败，不输出敏感内容。

## 保留什么，更新什么

管理器只修改目标插件的 `extensions/node_modules/<插件名>`、`config/app.json` 的 bundles 清单、`config/plugin-manager.json` 登记信息，以及 `extensions/.plugin-manager/` 事务备份。不修改 `core/`、模型/RAG配置与密钥、钉钉绑定、聊天/任务数据或 `workspace/`，也不替换 `config/defaults/`。

新启动协调代码只清理回滚后遗留在 profile 中的“管理器引入的插件引用”，保留其他用户插件和用户补丁。APP正常启动仍会按原逻辑维护运行时 profile。

插件包不能写入任意配置或数据目录，不能修改内核模块，不能携带符号链接或指向外部的路径。Windows 与麒麟以及 x64/ARM64 的原生库不能混用。兼容性清单按内核版本判断，不再要求 APP 发行编号完全相同；内核升级后仍需确认插件声明支持新版本。

## 失败和回退

安装先验证完整清单、文件 SHA256、实际系统/CPU/Node、原生库架构、显式外部依赖和磁盘空间；再把新文件暂存，逐个插件替换目录并保留旧目录。已有插件遗留的旧代码文件不会混入新版。

一般安装异常会自动恢复旧插件和清单。被强制结束时保留事务记录，APP启动检查会阻止带着半更新状态启动，使用 `recover` 恢复后再启动。历史备份保留在本机，不自动删除，需预留空间。

回滚仅支持最近事务，且拒绝覆盖事务后发生的插件或应用元数据变更。若提示配置变化或备份损坏，请保留目录处理冲突，不要强删锁或备份。模型/RAG/绑定等独立数据配置的正常修改不影响插件回滚。插件本身若在新版本运行时迁移了业务数据，代码回滚不能逆转这种迁移，应由插件另行提供数据兼容说明和备份方案。

## 开发者制作后续离线插件包

在获批构建机提前准备好插件及其依赖和离线资源；输出目录必须是新目录：

```sh
node scripts/build-offline-plugin.cjs \
  --source /build/prepared-plugin \
  --output /build/offline-package \
  --core 0.2.1-rc.3 --os linux --arch arm64
```

输出含 `plugin-package.json`、其 SHA256 文件，以及 `payload/<插件名>/`。把整个输出目录打包传入内网，解压后交给管理器。没有指定版本兼容范围、缺少实际依赖或文件被篡改时会拒绝安装。打包器不运行依赖安装，不自动把 Windows 原生模块转换为 ARM64。

宿主提供的外部依赖需通过 `--requires /build/requires.json` 明确指定可接受的**精确版本列表**，例如 `{"@example/base":["1.0.0"]}`。其余 package.json dependencies 必须放在插件自身 node_modules 中；多插件包还需一起声明所有目标插件。管理器也会检查已管理的其他插件是否被本次依赖升级破坏。

清单和依赖声明须由发布者审查，文件散列仅验证完整性，不构成发布者签名。可通过受信任渠道核对清单 SHA256，然后运行 `sh 管理插件.sh check /包目录 --sha256 <清单SHA256>`，安装时同样传入该参数。

重新生成接入工具包：

```sh
python scripts/package-plugin-manager.py --output /build/Neiwang-Offline-Plugin-Manager-R11.3.tar.gz
```

新构建流程已自动放入管理器及启动协调代码；历史 R11.3 安装包不被悄悄改写，现有用户使用上述小型接入包。每个平台的GitHub Release安装资产继续使用Core/Plugins拆分，管理器源码和本文保留在仓库。
