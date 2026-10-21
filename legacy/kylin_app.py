"""麒麟 Agent CLI 与一键验收入口。"""
import argparse
import contextlib
import getpass
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.parse
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent
DEFAULTS = {"base_url": "", "model": "deepseek_v4", "models": ["deepseek_v4", "qwen3.8"],
            "request_timeout": 45, "case_timeout": 180, "max_steps": 12, "max_tool_calls": 8}
HELP = "可直接问答，或调用加法、乘法、除法工具。指令：帮助 / 清空上下文 / 退出。"


def quiet_environment():
    # 此发行版不向外部追踪服务发送运行记录。
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
    os.environ["LANGCHAIN_TRACING"] = "false"
    os.environ["LANGSMITH_TRACING"] = "false"
    os.environ["LANGSMITH_TRACING_V2"] = "false"


def redact(value, key):
    text = str(value)
    if key:
        for secret in (key, urllib.parse.quote(key, safe=""), json.dumps(key)[1:-1]):
            text = text.replace(secret, "[REDACTED]")
    return re.sub(r"(?i)Bearer\s+[^\s\"']+", "Bearer [REDACTED]", text)


def load_config(path):
    config = dict(DEFAULTS)
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict) or set(raw) - set(DEFAULTS):
            raise ValueError("配置必须是 JSON 对象且只包含模板中的字段；密钥不要写入配置")
        config.update(raw)
    config["base_url"] = os.environ.get("LLM_BASE_URL") or config["base_url"]
    for name in ("request_timeout", "case_timeout", "max_steps", "max_tool_calls"):
        if type(config[name]) is not int or config[name] < 1 or config[name] > 600:
            raise ValueError(name + " 必须是 1 到 600 的整数")
    if not isinstance(config["models"], list) or not config["models"] or any(
            not isinstance(m, str) or not m.strip() for m in config["models"]):
        raise ValueError("models 必须是非空模型名列表")
    if not isinstance(config["model"], str) or not config["model"].strip():
        raise ValueError("model 必须是非空字符串")
    validate_url(config["base_url"], allow_empty=True)
    return config


def validate_url(value, allow_empty=False):
    if allow_empty and value == "":
        return
    if not isinstance(value, str):
        raise ValueError("base_url 必须是字符串")
    url = urllib.parse.urlsplit(value)
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError("base_url 必须是完整 HTTP(S) 地址，不能带密钥、查询参数或片段")


def credentials(config, path):
    if not config["base_url"]:
        config["base_url"] = input("输入之前成功的 BASE_URL（保留 /v1 等路径）：").strip()
        validate_url(config["base_url"])
        path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("接口地址已保存至配置文件。")
    key = os.environ.get("LLM_API_KEY") or getpass.getpass("API Key（不显示、不写入文件）：")
    if not key.strip():
        raise ValueError("API Key 不能为空")
    return key


def cli(config, key):
    from harness.kylin import KylinAgent, ToolBudgetExceeded
    from langgraph.errors import GraphRecursionError
    from openai import APITimeoutError
    engine = None
    print("内网 Agent / 模型：" + config["model"])
    print(HELP)
    try:
        while True:
            try:
                text = input("你：").strip()
            except EOFError:
                break
            if text in ("退出", "exit", "quit"):
                break
            if not text:
                continue
            if text in ("帮助", "help", "?"):
                print(HELP)
                continue
            if text in ("清空上下文", "reset"):
                if engine:
                    engine.reset()
                print("已清空上下文。")
                continue
            try:
                if engine is None:
                    engine = KylinAgent(config, key)
                print("Agent：" + engine.invoke(text)["answer"])
            except APITimeoutError:
                print("请求超时，本轮已停止并清空上下文，可重新提问。")
            except (GraphRecursionError, ToolBudgetExceeded):
                print("达到本轮调用上限，已停止并清空上下文。")
            except Exception as exc:
                print("处理失败：" + redact(type(exc).__name__ + ": " + str(exc), key))
    except KeyboardInterrupt:
        print("\n已退出。")
    finally:
        if engine:
            engine.close()
    return 0


def acceptance(config, key):
    # 单独进程隔离每项测试，能够终止卡住的请求并继续下一项。
    cases = [("environment", ""), ("cli_startup", ""), ("timeout", ""),
             ("loop_limit", ""), ("tool_budget", "")]
    for model in config["models"]:
        cases.extend((name, model) for name in ("raw_roundtrip", "framework_tools", "memory", "multi_tool", "tool_error"))
    out = ROOT / "reports" / (time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6])
    out.mkdir(parents=True)
    results = []
    report = {"schema_version": 1, "started": time.strftime("%Y-%m-%d %H:%M:%S"),
              "models": config["models"], "results": results,
              "scope": "基础计算 Agent 验收；不测试 DEN、文档、Web 或真实业务写入"}

    def save():
        content = redact(json.dumps(report, ensure_ascii=False, indent=2), key)
        temporary = out / "report.tmp"
        temporary.write_text(content + "\n", encoding="utf-8")
        temporary.replace(out / "report.json")
        text = "\n".join("{status}: {case} {model}\n{detail}\n".format(**r) for r in results)
        (out / "report.txt").write_text(redact(text, key), encoding="utf-8")
    save()
    env = os.environ.copy()
    env["LLM_API_KEY"] = key
    env["AGENT_TEST_CONFIG"] = json.dumps(config)
    env["PYTHONIOENCODING"] = "utf-8"
    try:
        for index, (case, model) in enumerate(cases, 1):
            print("[{}/{}] {} {} ...".format(index, len(cases), case, model), flush=True)
            started = time.monotonic()
            try:
                process = subprocess.run([sys.executable, "-B", str(ROOT / "kylin_app.py"),
                    "worker", "--case", case, "--model", model], cwd=str(ROOT), env=env,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8", errors="replace",
                    timeout=config["case_timeout"])
                try:
                    item = json.loads(process.stdout)
                except ValueError:
                    item = {"status": "FAIL", "detail": "子进程输出异常：" + process.stdout[-3000:]}
                if process.returncode != 0:
                    item["status"] = "FAIL"
                if process.stderr:
                    item["diagnostic"] = process.stderr[-3000:]
                if item.get("status") not in ("PASS", "FAIL"):
                    item = {"status": "FAIL", "detail": "子进程没有返回有效测试状态"}
            except subprocess.TimeoutExpired:
                item = {"status": "FAIL", "detail": "超过单项 {} 秒上限，已终止该项".format(config["case_timeout"])}
            except OSError as exc:
                item = {"status": "FAIL", "detail": type(exc).__name__ + ": " + str(exc)}
            item.update(case=case, model=model, seconds=round(time.monotonic() - started, 2))
            item.setdefault("detail", "")
            results.append(item)
            save()
            print("  " + item["status"], flush=True)
    except KeyboardInterrupt:
        report["interrupted"] = True
        print("\n已中断；已完成的测试结果保留。")
    report["completed"] = len(results) == len(cases)
    report["passed"] = sum(r["status"] == "PASS" for r in results)
    report["total"] = len(cases)
    save()
    archive_path = out.with_suffix(".zip")
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ("report.json", "report.txt"):
            archive.write(out / name, arcname=name)
    print("\n通过 {}/{}。请带回报告压缩包：{}".format(report["passed"], len(cases), archive_path))
    return 0 if report["passed"] == len(cases) else 1


def main():
    quiet_environment()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("cli", "accept", "worker"))
    parser.add_argument("--config", type=Path, default=ROOT / "config.json")
    parser.add_argument("--case")
    parser.add_argument("--model")
    args = parser.parse_args()
    key = os.environ.get("LLM_API_KEY", "")
    try:
        if args.mode == "worker":
            from scripts.acceptance_cases import run_case
            config = json.loads(os.environ["AGENT_TEST_CONFIG"])
            log = io.StringIO()
            try:
                with contextlib.redirect_stdout(log):
                    detail = run_case(args.case, config, key, args.model)
                result = {"status": "PASS", "detail": detail}
            except Exception as exc:
                result = {"status": "FAIL", "detail": type(exc).__name__ + ": " + str(exc)}
            if log.getvalue():
                result["log"] = log.getvalue()[-6000:]
            print(redact(json.dumps(result, ensure_ascii=False), key))
            return 0 if result["status"] == "PASS" else 1
        config = load_config(args.config)
        if args.model:
            config["model"] = args.model
        key = credentials(config, args.config)
        return acceptance(config, key) if args.mode == "accept" else cli(config, key)
    except (ValueError, OSError) as exc:
        print("无法启动：" + redact(str(exc), key), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
