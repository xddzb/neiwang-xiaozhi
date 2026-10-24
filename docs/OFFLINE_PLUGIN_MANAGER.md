# 独立离线插件安装与升级

本机制支持在同一兼容内核上新增和升级插件，不重发整个 APP。安装期间不联网，不运行 npm、插件脚本或安装钩子。插件自身的业务联网行为取决于该插件实现；只安装组织信任的离线包。

## 已安装 R11.3 的麒麟电脑：只接入一次

完全退出 APP，使用平时运行 APP 的同一个用户（不要加 sudo），解压小型 `Neiwang-Offline-Plugin-Manager-R11.3.tar.gz`，进入 `Neiwang-Offline-Plugin-Manager` 目录：

```sh
sh 启用插件管理.sh "/完整路径/Neiwang-Xiaozhi-Kylin-ARM64-R11.3"
```

这一步只增加管理器、启动检查和插件清单协调代码，保留原 bootstrap 的模型解密方式与启动配置，不替换内核，不接触用户数据。原启动器备份在 `extensions/.plugin-manager/setup-backup/bootstrap.cjs`。重复接入不会重复插入代码。该接入工具仅支持 R11.3/R11.3-dev，旧发行版本应另做适配。

以后在 APP 根目录管理插件：

```sh
# 新插件：先检查已解压的离线包，再安装
sh 管理插件.sh check "/离线包目录"
sh 管理插件.sh install "/离线包目录"

# 首次接管旧版安装器装过的同名插件，需要明确接管
sh 管理插件.sh check "/离线包目录" --adopt-existing
sh 管理插件.sh install "/离线包目录" --adopt-existing

# 查看已管理插件、最近事务及待恢复状态
sh 管理插件.sh list

# 回退最近一次安装/升级；多次执行可依次回退
sh 管理插件.sh rollback

# 断电、进程被结束或安装中断后恢复，再启动 APP
sh 管理插件.sh recover
sh start.sh
```

安装成功后请重启 APP。更新同名插件时必须提高插件版本，不能悄悄替换相同版本的不同内容；降级请使用回滚。已管理插件若有本地文件修改，安装器会拒绝覆盖，请先保存并处理这些修改。

原 `plugin-pack/安装插件.sh` 仅用于原配整套插件的首次初始化。新管理器使用独立的 `plugin-package.json` 格式，不能把旧整套插件包直接当成增量包；后续新增和升级统一使用 `管理插件.sh`。

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
  --core 0.2.0-rc.2 --os linux --arch arm64
```

输出含 `plugin-package.json`、其 SHA256 文件，以及 `payload/<插件名>/`。把整个输出目录打包传入内网，解压后交给管理器。没有指定版本兼容范围、缺少实际依赖或文件被篡改时会拒绝安装。打包器不运行依赖安装，不自动把 Windows 原生模块转换为 ARM64。

宿主提供的外部依赖需通过 `--requires /build/requires.json` 明确指定可接受的**精确版本列表**，例如 `{"@example/base":["1.0.0"]}`。其余 package.json dependencies 必须放在插件自身 node_modules 中；多插件包还需一起声明所有目标插件。管理器也会检查已管理的其他插件是否被本次依赖升级破坏。

清单和依赖声明须由发布者审查，文件散列仅验证完整性，不构成发布者签名。可通过受信任渠道核对清单 SHA256，然后运行 `sh 管理插件.sh check /包目录 --sha256 <清单SHA256>`，安装时同样传入该参数。

重新生成接入工具包：

```sh
python scripts/package-plugin-manager.py --output /build/Neiwang-Offline-Plugin-Manager-R11.3.tar.gz
```

新构建流程已自动放入管理器及启动协调代码；历史 R11.3 安装包不被悄悄改写，现有用户使用上述小型接入包。GitHub Release 继续只保留两个 APP 安装资产，管理器源码和本文保留在仓库。
