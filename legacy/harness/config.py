"""配置加载：读取项目根目录的 config.yaml，缺省时退回内置默认值。"""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

DEFAULTS = {
    "llm": {"provider": "dify"},  # dify / deepseek
    "dify": {
        "base_url": "",
        "api_key": "",
        "app_type": "auto",  # chat / workflow / auto
        "workflow_input_key": "query",  # 工作流应用的输入变量名
        "timeout": 60,
    },
    "server": {"host": "127.0.0.1", "port": 8600},
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "",
        "model": "deepseek-chat",
        "timeout": 60,
    },
    "den_platform": {
        "base_url": "http://127.0.0.1:8799",
        "exe_path": "",
        "start_wait_seconds": 90,
    },
    "dingtalk": {"client_id": "", "client_secret": ""},
}


def project_root() -> Path:
    """兼容源码运行与 PyInstaller 打包：配置永远放在程序旁边。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _merge(base: dict, override: dict) -> dict:
    merged = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_config(path: Path | None = None) -> dict:
    path = path or project_root() / "config.yaml"
    if not path.is_file():
        example = path.with_name("config.example.yaml")
        if example.is_file():
            print(f"[config] 未找到 {path.name}，请复制 config.example.yaml 并填写真实配置。")
        return DEFAULTS
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return _merge(DEFAULTS, data)
