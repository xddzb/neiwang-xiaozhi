"""Web 接入：本地 FastAPI 服务 + 单页聊天界面，启动后自动打开浏览器。"""
from __future__ import annotations

import threading
import webbrowser

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from harness.engine import AgentEngine

PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>内网Agent</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; font-family:"Microsoft YaHei",sans-serif; background:#f3f4f6; height:100vh;
         display:flex; flex-direction:column; }
  header { background:#1f2937; color:#fff; padding:12px 20px; font-size:16px; }
  #chat { flex:1; overflow-y:auto; padding:16px 20px; }
  .msg { max-width:75%; padding:10px 14px; border-radius:10px; margin:8px 0;
         white-space:pre-wrap; word-break:break-word; line-height:1.6; }
  .user { background:#2563eb; color:#fff; margin-left:auto; }
  .bot { background:#fff; border:1px solid #e5e7eb; }
  .sys { background:none; color:#9ca3af; font-size:12px; text-align:center; max-width:100%; }
  #bar { display:flex; gap:8px; padding:12px 20px; background:#fff; border-top:1px solid #e5e7eb; }
  #input { flex:1; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; }
  button { padding:10px 20px; background:#2563eb; color:#fff; border:0; border-radius:8px;
           cursor:pointer; font-size:14px; }
  button:disabled { background:#9ca3af; }
</style>
</head>
<body>
<header>内网Agent</header>
<div id="chat"></div>
<div id="bar">
  <input id="input" placeholder="输入消息，回车发送。试试：帮助" autofocus>
  <button id="send">发送</button>
</div>
<script>
const uid = localStorage.agentUid || (localStorage.agentUid = crypto.randomUUID());
const chat = document.getElementById('chat'), input = document.getElementById('input'),
      btn = document.getElementById('send');
function add(text, cls) {
  const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text;
  chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
}
async function send() {
  const text = input.value.trim(); if (!text) return;
  input.value = ''; add(text, 'user'); btn.disabled = true;
  const pending = add('思考中…', 'bot');
  try {
    const r = await fetch('/api/chat', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({user_id: uid, message: text}) });
    const data = await r.json();
    pending.textContent = data.reply;
  } catch (e) { pending.textContent = '请求失败：' + e; }
  btn.disabled = false; input.focus();
}
btn.onclick = send;
input.onkeydown = e => { if (e.key === 'Enter') send(); };
fetch('/api/help').then(r => r.json()).then(d => add(d.reply, 'sys'));
</script>
</body>
</html>"""


class ChatRequest(BaseModel):
    user_id: str = "web-user"
    message: str


def create_app(engine: AgentEngine) -> FastAPI:
    app = FastAPI(title="内网Agent")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return PAGE

    @app.get("/api/help")
    def help_() -> dict:
        return {"reply": engine.help_text()}

    @app.post("/api/chat")
    def chat(req: ChatRequest) -> dict:
        return {"reply": engine.handle(req.user_id, req.message)}

    return app


def main() -> None:
    engine = AgentEngine()
    host = engine.config["server"]["host"]
    port = int(engine.config["server"]["port"])
    url = f"http://{host}:{port}/"
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    print(f"内网Agent Web 界面: {url}")
    uvicorn.run(create_app(engine), host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
