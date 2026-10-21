"""LangChain 工具集：把本地能力包装成 agent 可自主调用的工具。

工具函数体复用 DEN 平台的 HTTP 桥接；异常统一转成文本返回，
避免单个工具失败打断 agent 循环。
新增能力 = 在这里加一个 @tool 函数并加入 build_tools 返回列表。
"""
from __future__ import annotations

from langchain_core.tools import BaseTool, tool

from .bridge import DenPlatform


def build_tools(config: dict) -> list[BaseTool]:
    platform = DenPlatform(config["den_platform"])

    @tool
    def den_review_start(den_id: str) -> str:
        """启动单份 DEN 执行质量复核。参数 den_id 形如 LFDENPSED5GCT000144-S。
        复核是后台任务，返回任务ID，可用 den_review_status 查询进度。"""
        try:
            job = platform.post("/api/start-den-review", {"den_id": den_id.strip().upper()})
            return f"复核已启动，任务ID：{job['job_id']}。当前状态：{job.get('message', '')}"
        except Exception as exc:
            return f"启动复核失败：{exc}"

    @tool
    def den_review_status(job_id: str) -> str:
        """查询 DEN 复核任务的进度或结果。参数 job_id 是启动复核时返回的任务ID。"""
        try:
            job = platform.get("/api/review-job", {"id": job_id.strip()})
        except Exception as exc:
            return f"查询失败：{exc}"
        if job.get("kind") == "batch_review":
            return (f"批量复核：{job.get('message', '')}；进度 {job.get('current', 0)}/{job.get('total', 0)}"
                    f"（成功 {job.get('completed_count', 0)}，失败 {job.get('failed_count', 0)}）")
        lines = [f"DEN：{job.get('den_id')}，状态：{job.get('status')}，{job.get('message', '')}"]
        if job.get("status") == "completed":
            lines.append(f"耗时 {job.get('elapsed_seconds', '?')}s；"
                         f"报告链接：{platform.url(f'/api/review-report?id={job_id}')}")
        return "\n".join(lines)

    @tool
    def den_review_report(den_id: str) -> str:
        """获取某份 DEN 最新复核报告的链接。参数 den_id 形如 LFDENPSED5GCT000144-S。"""
        try:
            platform.ensure_running()
        except Exception as exc:
            return str(exc)
        return f"最新复核报告（浏览器打开）：{platform.url(f'/api/latest-review-report?den={den_id.strip().upper()}')}"

    @tool
    def den_batch_review() -> str:
        """启动一键批量复核：处理所有待分析和证据不足的 DEN（数据库、通讯点表、逻辑组态、站间网络变量四类）。"""
        try:
            job = platform.post("/api/start-batch-review")
            return f"批量复核已启动，共 {job.get('total', '?')} 份，任务ID：{job['job_id']}。"
        except Exception as exc:
            return f"启动批量复核失败：{exc}"

    @tool
    def den_weekly_report() -> str:
        """生成 DEN 双周报，返回预览链接和邮件草稿下载链接。周报不会自动发送。"""
        try:
            report = platform.post("/api/generate-weekly-report")
        except Exception as exc:
            return f"生成周报失败：{exc}"
        lines = ["周报已生成："]
        if report.get("preview_url"):
            lines.append(f"预览：{platform.url(report['preview_url'])}")
        if report.get("email_url"):
            lines.append(f"邮件草稿：{platform.url(report['email_url'])}（下载后在邮件软件中填写收件人发送）")
        return "\n".join(lines)

    return [den_review_start, den_review_status, den_review_report,
            den_batch_review, den_weekly_report]
