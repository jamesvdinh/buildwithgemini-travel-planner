import os
import time
import json
import uuid
import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path

# Ensure Vertex AI environment variables are set before importing ADK
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "qwiklabs-gcp-03-1811e09e9290")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")

import sys
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from google.genai import types
from google.adk.memory import VertexAiMemoryBankService
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from app.agent import app as adk_app

ITINERARY_FILE = BASE_DIR / "itinerary.md"
CHATS_FILE = BASE_DIR / "frontend" / "chats_store.json"

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Travel Planner AI Web App")

# Enable CORS for GitHub Pages & web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ADK runner & Memory Service setup
session_service = InMemorySessionService()
try:
    memory_service = VertexAiMemoryBankService(
        project="qwiklabs-gcp-03-1811e09e9290",
        location="us-central1",
        agent_engine_id="709644046020116480",
    )
except Exception as e:
    from google.adk.memory import InMemoryMemoryService
    memory_service = InMemoryMemoryService()

runner = Runner(
    app=adk_app,
    session_service=session_service,
    memory_service=memory_service,
    auto_create_session=True,
)

# Helper function to read/write persistent chat storage
def load_chats_store() -> Dict[str, Any]:
    if CHATS_FILE.exists():
        try:
            with open(CHATS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_chats_store(data: Dict[str, Any]):
    CHATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CHATS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    include_itinerary: bool = True
    auto_allow_edits: bool = False


class ItinerarySaveRequest(BaseModel):
    content: str


@app.post("/api/itinerary/approve")
def approve_itinerary_edit(req: ItinerarySaveRequest):
    try:
        ITINERARY_FILE.write_text(req.content, encoding="utf-8")
        return {"status": "success", "message": "Proposed itinerary edit approved and saved to disk."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/itinerary")
def get_itinerary():
    if not ITINERARY_FILE.exists():
        default_content = "# ✈️ Master Travel Itinerary\n\nNo itinerary generated yet."
        ITINERARY_FILE.write_text(default_content, encoding="utf-8")
    
    content = ITINERARY_FILE.read_text(encoding="utf-8")
    return {"content": content, "file_path": str(ITINERARY_FILE)}


@app.post("/api/itinerary")
def save_itinerary(req: ItinerarySaveRequest):
    try:
        ITINERARY_FILE.write_text(req.content, encoding="utf-8")
        return {"status": "success", "message": "Itinerary saved successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chats")
def list_chats():
    store = load_chats_store()
    sessions = []
    for sid, data in store.items():
        sessions.append({
            "session_id": sid,
            "title": data.get("title", "Trip Planning Session"),
            "created_at": data.get("created_at", ""),
            "updated_at": data.get("updated_at", ""),
            "message_count": len(data.get("messages", []))
        })
    # Sort by updated_at descending
    sessions.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return {"sessions": sessions}


@app.get("/api/chats/{session_id}")
def get_chat_session(session_id: str):
    store = load_chats_store()
    if session_id not in store:
        raise HTTPException(status_code=404, detail="Session not found")
    return store[session_id]


@app.post("/api/chats/new")
def create_new_chat():
    session_id = str(uuid.uuid4())
    now_str = datetime.datetime.now().isoformat()
    store = load_chats_store()
    store[session_id] = {
        "session_id": session_id,
        "title": "New Travel Plan",
        "created_at": now_str,
        "updated_at": now_str,
        "messages": []
    }
    save_chats_store(store)
    return {"session_id": session_id, "title": "New Travel Plan"}


@app.delete("/api/chats/{session_id}")
def delete_chat_session(session_id: str):
    store = load_chats_store()
    if session_id in store:
        del store[session_id]
        save_chats_store(store)
    return {"status": "success"}


@app.post("/api/chat")
async def send_chat_message(req: ChatRequest):
    store = load_chats_store()
    session_id = req.session_id or str(uuid.uuid4())
    now_str = datetime.datetime.now().isoformat()

    if session_id not in store:
        store[session_id] = {
            "session_id": session_id,
            "title": req.message[:30] + ("..." if len(req.message) > 30 else ""),
            "created_at": now_str,
            "updated_at": now_str,
            "messages": []
        }
    
    # Read current itinerary source of truth
    itinerary_content = ""
    if ITINERARY_FILE.exists():
        itinerary_content = ITINERARY_FILE.read_text(encoding="utf-8")

    # Construct prompt with optional itinerary context
    prompt_text = req.message
    if req.include_itinerary and itinerary_content:
        prompt_text += f"\n\n[Context - Current itinerary.md Source of Truth]:\n{itinerary_content}"

    # Record User Message
    store[session_id]["messages"].append({
        "role": "user",
        "content": req.message,
        "timestamp": now_str
    })

    # Prepare ADK session
    adk_session = await session_service.get_session(app_name=adk_app.name, user_id="user_1", session_id=session_id)
    if not adk_session:
        adk_session = await session_service.create_session(app_name=adk_app.name, user_id="user_1", session_id=session_id)

    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=prompt_text)]
    )

    tool_traces = []
    final_reply_parts = []
    start_time = time.time()

    try:
        async for event in runner.run_async(
            user_id="user_1",
            session_id=session_id,
            new_message=content,
        ):
            if hasattr(event, "content") and event.content:
                for part in getattr(event.content, "parts", []):
                    # Capture tool calls
                    if hasattr(part, "function_call") and part.function_call:
                        call = part.function_call
                        tool_traces.append({
                            "type": "call",
                            "tool_name": call.name,
                            "args": call.args if hasattr(call, "args") else {},
                            "timestamp": datetime.datetime.now().isoformat(),
                            "status": "executing"
                        })
                    # Capture tool responses
                    elif hasattr(part, "function_response") and part.function_response:
                        resp = part.function_response
                        duration = round((time.time() - start_time) * 1000, 1)
                        tool_traces.append({
                            "type": "response",
                            "tool_name": resp.name,
                            "response": resp.response if hasattr(resp, "response") else {},
                            "duration_ms": duration,
                            "status": "success",
                            "timestamp": datetime.datetime.now().isoformat()
                        })
                    # Capture plain text response
                    elif hasattr(part, "text") and part.text:
                        final_reply_parts.append(part.text)

    except Exception as e:
        error_msg = f"Error during agent execution: {str(e)}"
        final_reply_parts.append(error_msg)
        tool_traces.append({
            "type": "error",
            "tool_name": "system",
            "response": {"error": str(e)},
            "status": "failed",
            "timestamp": datetime.datetime.now().isoformat()
        })

    agent_reply = "".join(final_reply_parts) if final_reply_parts else "No response generated."

    # Inspect tool_traces for update_itinerary_file calls
    proposed_itinerary = None
    auto_applied = False
    for t in tool_traces:
        if t.get("tool_name") == "update_itinerary_file" and t.get("type") == "call":
            args = t.get("args", {})
            markdown_val = args.get("new_itinerary_markdown") or args.get("new_content")
            if markdown_val:
                if req.auto_allow_edits:
                    auto_applied = True
                else:
                    proposed_itinerary = markdown_val

    # Re-read latest itinerary from disk
    if ITINERARY_FILE.exists():
        itinerary_content = ITINERARY_FILE.read_text(encoding="utf-8")

    # Record Assistant Message in Store
    store[session_id]["messages"].append({
        "role": "assistant",
        "content": agent_reply,
        "tool_traces": tool_traces,
        "proposed_itinerary": proposed_itinerary,
        "auto_applied": auto_applied,
        "timestamp": datetime.datetime.now().isoformat()
    })
    store[session_id]["updated_at"] = datetime.datetime.now().isoformat()
    save_chats_store(store)

    return {
        "session_id": session_id,
        "reply": agent_reply,
        "tool_traces": tool_traces,
        "proposed_itinerary": proposed_itinerary,
        "auto_applied": auto_applied,
        "itinerary_md": itinerary_content
    }


# Mount Static Files for Frontend
STATIC_DIR = BASE_DIR / "frontend" / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.get("/")
def read_root():
    return FileResponse(STATIC_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=3000, reload=True)
