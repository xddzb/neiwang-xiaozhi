"""钉钉接入：Stream 模式机器人。

Stream 模式由本程序主动向钉钉建立长连接收消息，内网环境无需公网回调地址。
需要在钉钉开放平台创建企业内部应用机器人，拿到 AppKey/AppSecret 填入 config.yaml。
"""
from __future__ import annotations

from harness.engine import AgentEngine


def main() -> None:
    engine = AgentEngine()
    cfg = engine.config["dingtalk"]
    if not cfg.get("client_id") or not cfg.get("client_secret"):
        raise SystemExit("请先在 config.yaml 的 dingtalk 一节填写 client_id / client_secret"
                         "（钉钉开放平台 → 企业内部应用 → 机器人的 AppKey/AppSecret）。")

    import dingtalk_stream
    from dingtalk_stream import AckMessage

    class AgentHandler(dingtalk_stream.ChatbotHandler):
        async def process(self, callback):
            incoming = dingtalk_stream.ChatbotMessage.from_dict(callback.data)
            text = (incoming.text.content or "").strip()
            user_id = incoming.sender_staff_id or incoming.sender_id or "dingtalk-user"
            reply = engine.handle(f"dingtalk:{user_id}", text)
            self.reply_text(reply, incoming)
            return AckMessage.STATUS_OK, "ok"

    credential = dingtalk_stream.Credential(cfg["client_id"], cfg["client_secret"])
    client = dingtalk_stream.DingTalkStreamClient(credential)
    client.register_callback_handler(dingtalk_stream.chatbot.ChatbotMessage.TOPIC, AgentHandler())
    print("钉钉机器人已启动（Stream 模式），在钉钉里 @机器人 或单聊即可对话。")
    client.start_forever()


if __name__ == "__main__":
    main()
