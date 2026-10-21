@echo off
rem 打包内网Agent为 exe（单目录模式，config.yaml 放在 exe 旁边便于修改）
cd /d %~dp0
pyinstaller --noconfirm --clean --name NeiAgent ^
  --add-data "config.example.yaml;." ^
  --collect-submodules dingtalk_stream ^
  run.py
echo.
echo 打包完成后：把 config.yaml 复制到 dist\NeiAgent\ 下，双击 NeiAgent.exe 即可。
pause
