from pathlib import Path
import json,platform
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'dist/R10-Modular'
archives=json.loads((ROOT/'outputs/R10-archive-validation.json').read_text())['archives']
lines=['内网小智 R10 核心＋插件分装版','', '每个压缩包均小于450,000,000字节，可分别通过钉钉发送。无需分卷合并。','']
lines.extend(['核心包根目录和插件包的plugin-pack目录中均附有“安装说明.txt”与“R10更新说明.txt”。包内说明不包含自身压缩包的SHA256，最终校验值以本文件及外附.sha256为准。',''])
for item in archives:lines.extend([item['file'],f"大小：{item['bytes']:,} 字节（{item['bytes']/1_000_000:.2f} MB）",'SHA256：'+item['sha256'],''])
lines.extend(['安装顺序：','1. 解压适合本机平台的 Core 核心包到新目录，Windows 双击 内网小智.exe；麒麟 ARM64 运行 sh start.sh。核心可单独启动，模型推理仍需要配置模型接口。','2. 完全退出 APP。解压同平台 Plugins 插件包，把其中的 plugin-pack 文件夹复制到核心根目录（与 runtime、config 同级）。也可将两个压缩包解压到同一个父目录，让同名应用目录合并。','3. Windows 双击 plugin-pack/安装插件.cmd；麒麟在核心根目录运行 sh plugin-pack/安装插件.sh。安装器校验平台、版本、完整性并注册插件，成功后重启 APP。','4. 仅解压插件不会启用插件；完整安装后才会出现钉钉机器人、AI表格等入口。不要使用Win7包，也不要把R10插件安装到R9中。','', '内容：','核心：完整官方 DSH 0.2.0-rc.2 内核与基础依赖、桌面壳、模型对话、文件/命令工具、代码变更查看、品牌与基础配置。麒麟核心另含界面中文字库、bubblewrap及其许可证/源码。','插件：钉钉官方 Stream 连接器和绑定设置、DWS AI表格、Python/PyInstaller、Office/PDF/OCR及内网知识库/业务工具。','核心自带基础Python运行时供配置等基础功能使用；完整文档处理依赖和Python工具注册由插件包提供。','', '配置与维护：','插件安装不会覆盖 data、workspace 或现有模型/钉钉配置；精确匹配的插件可重复安装，冲突文件会拒绝覆盖。安装前退出应用并保留数据备份。','官方内核仍独立存放在 core/<版本>；插件位于 extensions。安装器只调整插件注册信息。','麒麟需要支持非特权用户命名空间的沙箱策略；不支持时文件工具会明确报错，不会自动降级为无限制执行。','', '验证记录：'])
checks=['R10-Windows-core.json','R10-Windows-full.json','R10-Win10-x64-installation.json','R10-DingTalk-Windows-tests.json','R10-ARM64-core.json','R10-ARM64-full.json','R10-Kylin-ARM64-installation.json']
for file in checks:
 p=ROOT/'outputs'/file
 if p.exists():v=json.loads(p.read_text(encoding='utf8'));lines.append(file+'：'+v['status'])
 else:lines.append(file+'：尚无完成报告')
lines.extend(['归档：逐文件校验、原始内核散列、插件有效载荷散列及无用户数据检查通过。','Windows实际执行环境为当前Windows 11主机；麒麟目标使用QEMU的ARM64 Ubuntu20.04环境验证。尚未替代原生Windows10及真实麒麟V10的实机验收。','钉钉消息与模型回路使用本地模拟数据验证，没有向真实群聊发送消息；真实账号授权与企业网络仍需部署后验收。'])
features=ROOT/'outputs/R10-feature-validation.json'
if features.exists():
 v=json.loads(features.read_text(encoding='utf8'))
 for name,item in v['platforms'].items():lines.append(name+'：DWS官方离线schema与本地数据模拟测试 '+item['dws']+'；PyInstaller实际构建并运行可执行文件 '+item['pyinstaller'])
updates=ROOT/'docs/R10更新说明.txt'
installation=ROOT/'docs/R10安装说明.txt'
if installation.exists():(out/'R10安装说明.txt').write_bytes(installation.read_bytes())
if updates.exists():
 text=updates.read_text(encoding='utf8')
 lines.extend(['','本次更新详细说明：',text])
 (out/'R10更新说明.txt').write_text(text,encoding='utf8')
(out/'安装与验证说明.txt').write_text('\n'.join(lines)+'\n',encoding='utf8')
print('Delivery guide written')
