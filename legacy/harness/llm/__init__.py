"""LLM 抽象层：引擎只依赖 LLMProvider 接口，不关心背后是 Dify 还是别的服务。"""
from .base import LLMProvider
from .dify import DifyProvider

__all__ = ["LLMProvider", "DifyProvider"]
