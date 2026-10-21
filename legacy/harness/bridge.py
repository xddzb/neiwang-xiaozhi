"""DEN执行质量辅助复核平台 的 HTTP 桥接。

平台本身是一个本地服务（默认 http://127.0.0.1:8799），工具层不碰它的内部代码，
只调它的 HTTP API。配置 den_platform.exe_path 后，服务未启动时会自动拉起平台 EXE。
"""
from __future__ import annotations

import subprocess
import time
from pathlib import Path

import requests


class DenPlatformError(RuntimeError):
    pass


class DenPlatform:
    def __init__(self, config: dict):
        self.base_url = str(config.get("base_url") or "http://127.0.0.1:8799").rstrip("/")
        self.exe_path = str(config.get("exe_path") or "")
        self.start_wait = int(config.get("start_wait_seconds") or 90)
        self._launching = False

    def alive(self) -> bool:
        try:
            resp = requests.get(f"{self.base_url}/api/platform", timeout=3)
            return resp.status_code == 200
        except requests.exceptions.RequestException:
            return False

    def ensure_running(self) -> None:
        if self.alive():
            return
        if not self.exe_path:
            raise DenPlatformError(
                "DEN 复核平台未运行。请先启动「DEN执行质量辅助复核平台.exe」，"
                "或在 config.yaml 的 den_platform.exe_path 中填入 EXE 路径以支持自动拉起。")
        exe = Path(self.exe_path)
        if not exe.is_file():
            raise DenPlatformError(f"den_platform.exe_path 指向的文件不存在：{exe}")
        if not self._launching:
            self._launching = True
            subprocess.Popen([str(exe)], cwd=str(exe.parent),
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        deadline = time.time() + self.start_wait
        while time.time() < deadline:
            if self.alive():
                return
            time.sleep(1)
        raise DenPlatformError(f"已拉起平台但 {self.start_wait}s 内服务未就绪，请手动打开平台确认。")

    def post(self, path: str, body: dict | None = None) -> dict:
        self.ensure_running()
        resp = requests.post(self.base_url + path, json=body or {}, timeout=30)
        data = self._parse(resp)
        return data

    def get(self, path: str, params: dict | None = None) -> dict:
        self.ensure_running()
        resp = requests.get(self.base_url + path, params=params or {}, timeout=30)
        return self._parse(resp)

    def url(self, path: str) -> str:
        """把平台返回的相对路径（如 /api/weekly-report?id=...）拼成完整链接。"""
        return self.base_url + path

    @staticmethod
    def _parse(resp: requests.Response) -> dict:
        try:
            data = resp.json()
        except ValueError as exc:
            raise DenPlatformError(f"平台返回了非 JSON 响应（HTTP {resp.status_code}）") from exc
        if resp.status_code >= 400:
            raise DenPlatformError(data.get("error") or f"HTTP {resp.status_code}")
        return data
