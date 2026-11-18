"""Split an already verified Windows ZIP and provide a local extraction helper."""
import argparse,hashlib,json
from pathlib import Path

def split(archive):
    output=archive.parent;parts=[]
    digest=hashlib.sha256()
    with archive.open('rb') as f:
        while data:=f.read(480_000_000):
            p=Path(str(archive)+f'.{len(parts)+1:03}')
            if p.exists():raise ValueError('Volume already exists')
            p.write_bytes(data);digest.update(data)
            parts.append({'name':p.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    expected=json.loads((output/'构建验证.json').read_text(encoding='utf-8'))['archiveSha256']
    if digest.hexdigest()!=expected:raise ValueError('Archive hash differs from verified build')
    (output/'volumes.json').write_text(json.dumps({'archive':archive.name,'sha256':expected,'parts':parts},indent=2),encoding='ascii')
    (output/'SHA256SUMS.txt').write_text(''.join(p['sha256']+'  '+p['name']+'\n' for p in parts),encoding='ascii')
    (output/'Extract.ps1').write_text('''param([string]$Destination = (Join-Path $PSScriptRoot 'ExtractedApp'))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (Test-Path -LiteralPath $Destination) { throw '目标目录已存在，请指定新目录，勿覆盖旧应用。' }
$meta = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'volumes.json') -Raw | ConvertFrom-Json
foreach ($part in $meta.parts) {
    $file = Join-Path $PSScriptRoot $part.name
    if ((Get-Item -LiteralPath $file).Length -ne $part.bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $part.sha256) { throw ('分卷校验失败：' + $part.name) }
}
New-Item -ItemType Directory -Path $Destination | Out-Null
$merged = Join-Path $Destination $meta.archive
$writer = [IO.File]::Create($merged)
try {
    foreach ($part in $meta.parts) {
        $reader = [IO.File]::OpenRead((Join-Path $PSScriptRoot $part.name))
        try { $reader.CopyTo($writer) } finally { $reader.Dispose() }
    }
} finally { $writer.Dispose() }
if ((Get-FileHash -LiteralPath $merged -Algorithm SHA256).Hash -ne $meta.sha256) { throw '合并后的 ZIP 校验失败。' }
$tarExe = Join-Path $env:SystemRoot 'System32\\tar.exe'
if (Test-Path -LiteralPath $tarExe) {
    & $tarExe -xf $merged -C $Destination
    if ($LASTEXITCODE -ne 0) { throw '解压失败，请保留错误信息。' }
} else { Expand-Archive -LiteralPath $merged -DestinationPath $Destination }
Remove-Item -LiteralPath $merged
Write-Output '解压完成。进入 ExtractedApp 内的应用目录，双击 start.cmd 或 内网小智.exe。插件已预装，无需额外安装。'
''',encoding='utf-8-sig')
    (output/'DoubleClickExtract.cmd').write_bytes(b'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Extract.ps1"\r\nif errorlevel 1 echo Extraction failed. Keep all volumes in the same folder.\r\npause\r\n')
    (output/'使用说明.txt').write_text('内网小智 Windows 10/11 x64 完整版 — 2026-11-18\n\n把本目录全部文件放在一起，双击 DoubleClickExtract.cmd。\n脚本校验分卷、合并和解压后，进入 ExtractedApp 下的应用目录，双击 start.cmd 或 内网小智.exe。\n插件已预装，运行时无需联网安装 Node、Python 或插件。业务查询仍需内网连接。\n请预留至少 8 GB 空间，使用新目录，不覆盖旧应用。此版本不适用于 Windows 7 或 ARM Windows。\n\n包含最新变更管理、侧边栏、ISU 定向证书兼容、浏览器登录态捕获和自动刷新、地址栏、多页面及开发者工具。\n查看变更：打开工作区/会话，在右侧面板入口选择“变更”，或点标签栏“＋”再选“变更”。\n\n本包包含内网配置和接口资料，仅供内网交付，勿上传公共网站。验收记录见同目录 JSON 文件；真实内网服务需要现场验证。\n',encoding='utf-8-sig')
    print(json.dumps({'volumes':len(parts),'bytes':sum(p['bytes'] for p in parts)}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);split(p.parse_args().archive)
