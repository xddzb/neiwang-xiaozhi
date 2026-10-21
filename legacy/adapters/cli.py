"""命令行接入：最快验证引擎的方式。输入「退出」结束，「帮助」查看能力。"""
from __future__ import annotations

from harness.engine import AgentEngine


def main() -> None:
    engine = AgentEngine()
    print("内网Agent（CLI 模式）")
    print(engine.help_text())
    print("输入「退出」结束对话。\n")
    while True:
        try:
            text = input("你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见。")
            break
        if text in ("退出", "exit", "quit"):
            print("再见。")
            break
        print(f"Agent: {engine.handle('cli-user', text)}\n")


if __name__ == "__main__":
    main()
