"""麒麟基础 Agent：OpenAI 兼容接口、内存会话、受限计算工具。"""
import json
import threading
import uuid


class ToolBudgetExceeded(RuntimeError):
    pass


class KylinAgent:
    def __init__(self, config, key, model=None):
        from langchain.agents import create_agent
        from langchain_core.tools import StructuredTool, ToolException
        from langgraph.checkpoint.memory import InMemorySaver
        from pydantic import BaseModel, Field, StrictInt

        self.config = config
        self.key = key
        self.session = uuid.uuid4().hex
        self.executions = []
        self._budget_lock = threading.Lock()
        self._count = 0

        class Pair(BaseModel):
            a: StrictInt = Field(description="第一个整数", ge=-1000000, le=1000000)
            b: StrictInt = Field(description="第二个整数", ge=-1000000, le=1000000)

        def operation(name, a, b):
            with self._budget_lock:
                if self._count >= config["max_tool_calls"]:
                    raise ToolBudgetExceeded("本轮工具调用次数已达到上限")
                self._count += 1
            if name == "divide_integers" and b == 0:
                result = {"error": "除数不能为零", "a": a, "b": b}
            else:
                value = a + b if name == "add_integers" else a * b if name == "multiply_integers" else a / b
                result = {"a": a, "b": b, "result": value}
            with self._budget_lock:
                self.executions.append({"name": name, "result": result})
            if "error" in result:
                raise ToolException(json.dumps(result, ensure_ascii=False))
            return json.dumps(result, ensure_ascii=False)

        def make_tool(name, description):
            def execute(a, b):
                return operation(name, a, b)
            return StructuredTool.from_function(execute, name=name, description=description,
                                                args_schema=Pair, handle_tool_error=True,
                                                handle_validation_error="参数错误：请提供范围内的两个整数")

        tools = [make_tool("multiply_integers", "在本地计算两个整数的乘积"),
                 make_tool("add_integers", "在本地计算两个整数的和"),
                 make_tool("divide_integers", "在本地执行除法；除数不能为零")]
        self.checkpointer = InMemorySaver()
        self.model = model if model is not None else self.build_model(config, key)
        self.graph = create_agent(
            self.model, tools=tools, checkpointer=self.checkpointer,
            system_prompt="你是内网助手，使用简体中文。用户要求计算时调用提供的工具，"
                          "不要编造执行结果。根据工具返回结果回答；工具失败时说明原因。"
                          "需要先后计算时，等待前一步工具返回再调用下一步。")

    @staticmethod
    def build_model(config, key):
        import httpx
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=config["model"], api_key=key, base_url=config["base_url"],
                          timeout=config["request_timeout"], max_retries=0, streaming=False,
                          use_responses_api=False,
                          http_client=httpx.Client(trust_env=False, timeout=config["request_timeout"]))

    def reset(self):
        # 丢弃旧检查点，避免清空命令后旧上下文仍占用内存。
        self.checkpointer.delete_thread(self.session)
        self.session = uuid.uuid4().hex

    def invoke(self, text):
        self.executions = []
        self._count = 0
        try:
            result = self.graph.invoke({"messages": [{"role": "user", "content": text}]},
                config={"configurable": {"thread_id": self.session},
                        "recursion_limit": self.config["max_steps"]})
            last = result["messages"][-1]
            content = last.content
            if isinstance(content, list):
                content = "".join(x.get("text", "") for x in content if isinstance(x, dict))
            if getattr(last, "tool_calls", None) or not isinstance(content, str) or not content.strip():
                raise ValueError("模型未返回最终文本回答")
            return {"answer": content, "executions": list(self.executions), "messages": result["messages"]}
        except Exception:
            self.reset()
            raise

    def close(self):
        client = getattr(self.model, "http_client", None)
        if client is not None:
            client.close()
