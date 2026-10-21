"""通用智能体引擎（harness）。

分层：
    adapters/  接入层（CLI / Web / 钉钉），只负责收发消息
    harness/   引擎层，本包：配置、LLM 适配、工具集、agent 编排（LangChain）
"""
