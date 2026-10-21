"""统一入口：python run.py --mode cli|web|dingtalk"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def main() -> None:
    parser = argparse.ArgumentParser(description="内网Agent")
    parser.add_argument("--mode", choices=["cli", "web", "dingtalk"], default="cli",
                        help="cli=命令行（默认） web=浏览器界面 dingtalk=钉钉机器人")
    args = parser.parse_args()

    if args.mode == "cli":
        from adapters.cli import main as run
    elif args.mode == "web":
        from adapters.web import main as run
    else:
        from adapters.dingtalk import main as run
    run()


if __name__ == "__main__":
    main()
